import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { Prisma } from '@prisma/client';
import { PrismaService, Tx } from '../prisma/prisma.service';
import { AuditService } from '../audit-logs/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SettingsService } from '../settings/settings.service';
import { paginate, PaginationQueryDto, skipTake } from '../common/pagination';
import { randomCode } from '../common/util';
import type { AuthUser } from '../common/auth-user';
import type { CourseProgress } from '../learning/progress.service';

@Injectable()
export class CertificatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly settings: SettingsService,
  ) {}

  /**
   * Issues the certificate if the learner satisfies the course's completion
   * rule. Idempotent: the (userId, courseId) unique constraint guarantees at
   * most one certificate per learner per course.
   */
  async issueIfEligible(userId: string, courseId: string, tx: Tx, progress: CourseProgress) {
    if (!progress.isComplete) return null;
    const existing = await tx.certificate.findUnique({ where: { userId_courseId: { userId, courseId } } });
    if (existing) return existing.status === 'VALID' ? existing : null;
    const [user, course, platformName] = await Promise.all([
      tx.user.findUniqueOrThrow({ where: { id: userId }, select: { fullName: true } }),
      tx.course.findUniqueOrThrow({ where: { id: courseId }, select: { title: true, creator: { select: { fullName: true } } } }),
      this.settings.get('general.platformName', tx),
    ]);
    const year = new Date().getFullYear();
    const certificate = await tx.certificate.create({
      data: {
        userId,
        courseId,
        serial: `SA-${year}-${randomCode(6)}`,
        verificationCode: randomCode(12),
        learnerName: user.fullName,
        courseTitle: course.title,
        issuerName: `${course.creator.fullName} · ${platformName}`,
      },
    });
    await this.notifications.notify(
      userId,
      { type: 'certificate.issued', title: `Certificate issued: ${course.title}`, body: `Serial ${certificate.serial}`, link: '/learn/certificates' },
      tx,
    );
    return certificate;
  }

  mine(userId: string) {
    return this.prisma.certificate.findMany({
      where: { userId },
      orderBy: { issuedAt: 'desc' },
      select: { id: true, serial: true, verificationCode: true, courseTitle: true, issuerName: true, issuedAt: true, status: true, courseId: true, revokeReason: true },
    });
  }

  /** Public verification. Returns only what is printed on the certificate itself. */
  async verify(code: string) {
    const normalised = code.trim().toUpperCase();
    const cert = await this.prisma.certificate.findFirst({
      where: { OR: [{ verificationCode: normalised }, { serial: normalised }] },
      select: { serial: true, learnerName: true, courseTitle: true, issuerName: true, issuedAt: true, status: true, revokedAt: true },
    });
    if (!cert) return { valid: false, found: false };
    return {
      valid: cert.status === 'VALID',
      found: true,
      serial: cert.serial,
      learnerName: cert.learnerName,
      courseTitle: cert.courseTitle,
      issuerName: cert.issuerName,
      issuedAt: cert.issuedAt,
      status: cert.status,
      revokedAt: cert.revokedAt,
    };
  }

  async pdf(user: AuthUser, id: string): Promise<{ buffer: Buffer; filename: string }> {
    const cert = await this.prisma.certificate.findUnique({ where: { id } });
    if (!cert) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Certificate not found' });
    if (cert.userId !== user.id && !user.permissions.has('certificates.manage')) {
      throw new ForbiddenException({ code: 'ACCOUNT_NOT_AUTHORIZED', message: 'Not your certificate' });
    }
    if (cert.status !== 'VALID') throw new ConflictException({ code: 'CERTIFICATE_REVOKED', message: 'This certificate has been revoked' });
    const platformName = await this.settings.get('general.platformName');
    return { buffer: await renderCertificatePdf(cert, platformName), filename: `${cert.serial}.pdf` };
  }

  async adminList(q: PaginationQueryDto & { status?: 'VALID' | 'REVOKED' }) {
    const where: Prisma.CertificateWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.search
        ? { OR: [{ serial: { contains: q.search, mode: 'insensitive' } }, { learnerName: { contains: q.search, mode: 'insensitive' } }, { courseTitle: { contains: q.search, mode: 'insensitive' } }] }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.certificate.findMany({ where, orderBy: { issuedAt: q.order }, ...skipTake(q), include: { revokedBy: { select: { fullName: true } } } }),
      this.prisma.certificate.count({ where }),
    ]);
    return paginate(items, total, q);
  }

  async revoke(actor: AuthUser, id: string, reason: string, ip?: string) {
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.certificate.updateMany({
        where: { id, status: 'VALID' },
        data: { status: 'REVOKED', revokedAt: new Date(), revokedById: actor.id, revokeReason: reason },
      });
      if (!claimed.count) throw new ConflictException({ code: 'NOT_REVOCABLE', message: 'Certificate not found or already revoked' });
      const cert = await tx.certificate.findUniqueOrThrow({ where: { id } });
      await this.audit.record({ actorId: actor.id, action: 'certificate.revoke', resourceType: 'Certificate', resourceId: id, ipAddress: ip, metadata: { serial: cert.serial, reason } }, tx);
      await this.notifications.notify(cert.userId, { type: 'certificate.revoked', title: `Certificate revoked: ${cert.courseTitle}`, body: reason, link: '/learn/certificates' }, tx);
      return cert;
    });
  }
}

function renderCertificatePdf(
  cert: { serial: string; verificationCode: string; learnerName: string; courseTitle: string; issuerName: string; issuedAt: Date },
  platformName: string,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 0, info: { Title: `${cert.courseTitle} — ${cert.learnerName}` } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    const W = doc.page.width;
    const H = doc.page.height;
    // Paper and frame
    doc.rect(0, 0, W, H).fill('#f4efe4');
    doc.lineWidth(1.2).strokeColor('#2f5d43').rect(28, 28, W - 56, H - 56).stroke();
    doc.lineWidth(0.4).strokeColor('#b6874a').rect(36, 36, W - 72, H - 72).stroke();
    // Winding path motif
    doc.save().lineWidth(1).strokeColor('#c9b896').dash(3, { space: 5 });
    doc.moveTo(60, H - 90).bezierCurveTo(220, H - 190, 330, H - 40, 470, H - 120).bezierCurveTo(600, H - 190, 690, H - 70, W - 60, H - 150).stroke();
    doc.restore();
    doc.fillColor('#2f5d43').font('Helvetica-Bold').fontSize(11).text(platformName.toUpperCase(), 0, 78, { align: 'center', characterSpacing: 4 });
    doc.fillColor('#6b6252').font('Helvetica').fontSize(12).text('Certificate of completion', 0, 112, { align: 'center' });
    doc.fillColor('#1d221f').font('Times-Roman').fontSize(40).text(cert.learnerName, 60, 168, { align: 'center', width: W - 120 });
    doc.fillColor('#6b6252').font('Helvetica').fontSize(12).text('has completed every requirement of', 0, 236, { align: 'center' });
    doc.fillColor('#2f5d43').font('Times-Bold').fontSize(24).text(cert.courseTitle, 80, 264, { align: 'center', width: W - 160 });
    const issued = new Intl.DateTimeFormat('en-GB', { dateStyle: 'long' }).format(cert.issuedAt);
    doc.fillColor('#1d221f').font('Helvetica').fontSize(10);
    doc.text(`Issued ${issued}`, 90, H - 128);
    doc.text(`Issued by ${cert.issuerName}`, 90, H - 112);
    doc.text(`Serial ${cert.serial}`, W - 330, H - 128, { width: 240, align: 'right' });
    doc.text(`Verification code ${cert.verificationCode}`, W - 330, H - 112, { width: 240, align: 'right' });
    doc.end();
  });
}
