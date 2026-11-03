'use client';
import { useQuery } from '@tanstack/react-query';
import {
  Award,
  BarChart3,
  BookOpen,
  ClipboardCheck,
  Compass,
  CreditCard,
  FileClock,
  FolderTree,
  Gauge,
  GraduationCap,
  Inbox,
  Landmark,
  LayoutList,
  LifeBuoy,
  Map,
  Menu,
  ReceiptText,
  Route,
  Settings,
  ShieldCheck,
  UserCheck,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { get, post } from '@/lib/api';
import { useLogout, useMe } from '@/features/auth/session';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Feedback';
import { NotificationBell } from './NotificationBell';
import { Wordmark } from './Wordmark';
import s from './nav.module.scss';

interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
  permission?: string;
  badge?: number;
  exact?: boolean;
}

const I = 16;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { data: me } = useMe();
  const logout = useLogout();
  const toast = useToast();
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname; // navigating closes the drawer
  const setOpen = (v: boolean) => setOpenOn(v ? pathname : null);

  const can = (p?: string) => !p || !!me?.permissions.includes(p);
  const { data: unread } = useQuery({
    queryKey: ['support', 'unread'],
    queryFn: () => get<{ unread: number }>('/support-threads/unread-count'),
    enabled: !!me,
    refetchInterval: 60_000,
  });

  const workspaces = [
    { key: 'learn', href: '/learn', label: 'Learn', show: true },
    { key: 'creator', href: '/creator', label: 'Create', show: can('courses.create') },
    { key: 'admin', href: '/admin', label: 'Admin', show: can('admin.access') },
  ].filter((w) => w.show);
  const area = pathname.startsWith('/admin') ? 'admin' : pathname.startsWith('/creator') ? 'creator' : 'learn';

  const groups: Record<string, { heading: string; items: NavItem[] }[]> = {
    learn: [
      {
        heading: 'Learning',
        items: [
          { href: '/learn', label: 'Dashboard', icon: <Compass size={I} />, exact: true },
          { href: '/courses', label: 'Find a course', icon: <BookOpen size={I} /> },
          { href: '/roadmaps', label: 'Roadmaps', icon: <Route size={I} /> },
          { href: '/learn/certificates', label: 'Certificates', icon: <Award size={I} /> },
          { href: '/learn/purchases', label: 'Purchases', icon: <ReceiptText size={I} /> },
        ],
      },
      {
        heading: 'Support',
        items: [
          { href: '/support', label: 'Questions', icon: <LifeBuoy size={I} />, badge: unread?.unread, exact: true },
          ...(can('support.respond') ? [{ href: '/support?scope=inbox', label: 'Mentor inbox', icon: <Inbox size={I} /> }] : []),
        ],
      },
    ],
    creator: [
      {
        heading: 'Creator workspace',
        items: [
          { href: '/creator', label: 'Overview', icon: <Gauge size={I} />, exact: true },
          { href: '/creator/courses', label: 'Courses', icon: <LayoutList size={I} /> },
          { href: '/creator/roadmaps', label: 'Roadmaps', icon: <Map size={I} /> },
          { href: '/support?scope=inbox', label: 'Learner questions', icon: <Inbox size={I} />, badge: unread?.unread },
        ],
      },
    ],
    admin: [
      {
        heading: 'Operate',
        items: [
          { href: '/admin', label: 'Overview', icon: <Gauge size={I} />, exact: true },
          { href: '/admin/courses', label: 'Courses', icon: <ClipboardCheck size={I} />, permission: 'courses.review' },
          { href: '/admin/creators', label: 'Creators', icon: <UserCheck size={I} />, permission: 'creators.review' },
          { href: '/admin/roadmaps', label: 'Roadmaps', icon: <Route size={I} />, permission: 'roadmaps.publish' },
          { href: '/admin/catalog', label: 'Subjects', icon: <FolderTree size={I} />, permission: 'catalog.manage' },
        ],
      },
      {
        heading: 'People',
        items: [
          { href: '/admin/users', label: 'Users', icon: <Users size={I} />, permission: 'users.read' },
          { href: '/admin/mentors', label: 'Mentors', icon: <GraduationCap size={I} />, permission: 'mentors.manage' },
          { href: '/admin/support', label: 'Support oversight', icon: <LifeBuoy size={I} />, permission: 'support.oversee' },
        ],
      },
      {
        heading: 'Money',
        items: [
          { href: '/admin/payments', label: 'Payments', icon: <CreditCard size={I} />, permission: 'payments.read' },
          { href: '/admin/finance', label: 'Revenue & ledger', icon: <Landmark size={I} />, permission: 'finance.read' },
        ],
      },
      {
        heading: 'Records',
        items: [
          { href: '/admin/reports', label: 'Learner reports', icon: <BarChart3 size={I} />, permission: 'reports.read' },
          { href: '/admin/certificates', label: 'Certificates', icon: <ShieldCheck size={I} />, permission: 'certificates.manage' },
          { href: '/admin/audit-logs', label: 'Audit log', icon: <FileClock size={I} />, permission: 'audit.read' },
          { href: '/admin/settings', label: 'Settings', icon: <Settings size={I} />, permission: 'settings.manage' },
        ],
      },
    ],
  };

  const isActive = (item: NavItem) => {
    const [path, query] = item.href.split('?');
    if (query) return false;
    return item.exact ? pathname === path : pathname === path || pathname.startsWith(`${path}/`);
  };

  const resend = async () => {
    try {
      await post('/auth/resend-verification');
      toast('Verification email sent. Check your inbox.');
    } catch {
      toast('Could not send the email. Try again shortly.', 'error');
    }
  };

  return (
    <div className={s.shell}>
      {open && <div className={s.scrim} onClick={() => setOpen(false)} aria-hidden />}
      <aside className={s.sidebar} data-open={open} aria-label="Workspace navigation">
        <Wordmark href="/learn" />
        {workspaces.length > 1 && (
          <nav className={s.workspaces} aria-label="Workspaces">
            {workspaces.map((w) => (
              <Link key={w.key} href={w.href} aria-current={area === w.key}>
                {w.label}
              </Link>
            ))}
          </nav>
        )}
        {groups[area].map((g) => {
          const items = g.items.filter((i) => can(i.permission));
          if (!items.length) return null;
          return (
            <nav key={g.heading} className={s.navGroup} aria-label={g.heading}>
              <span className={s.navHeading}>{g.heading}</span>
              {items.map((i) => (
                <Link key={i.href} href={i.href} className={s.navLink} aria-current={isActive(i) ? 'page' : undefined}>
                  {i.icon}
                  {i.label}
                  {!!i.badge && <span className={s.badge}>{i.badge}</span>}
                </Link>
              ))}
            </nav>
          );
        })}
        <div className={s.sidebarFoot}>
          {me && (
            <div className={s.who}>
              <strong>{me.fullName}</strong>
              <span>{me.email}</span>
            </div>
          )}
          <Link href="/profile" className={s.navLink} aria-current={pathname === '/profile' ? 'page' : undefined}>
            Profile & security
          </Link>
          {!me?.roles.includes('CREATOR') && (
            <Link href="/become-a-creator" className={s.navLink}>
              Teach on Genuslab
            </Link>
          )}
          <button type="button" className={s.navLink} style={{ background: 'none', border: 0, cursor: 'pointer', textAlign: 'left' }} onClick={logout}>
            Sign out
          </button>
        </div>
      </aside>
      <div className={s.main}>
        <header className={s.topbar}>
          <Button variant="tertiary" size="sm" className={s.menuToggle} onClick={() => setOpen(true)} aria-label="Open navigation">
            <Menu size={18} />
          </Button>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
            <NotificationBell />
          </div>
        </header>
        {me && !me.emailVerified && (
          <div className={s.verifyBanner} role="status">
            Confirm your email address to purchase courses and apply to teach.
            <Button size="sm" variant="secondary" onClick={resend}>
              Resend email
            </Button>
          </div>
        )}
        <main className={s.content} id="main">
          {children}
        </main>
      </div>
    </div>
  );
}
