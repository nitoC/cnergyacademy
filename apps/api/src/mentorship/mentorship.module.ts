import { Module } from '@nestjs/common';
import { MentorshipService } from './mentorship.service';
import { MentorshipController } from './mentorship.controller';

@Module({ providers: [MentorshipService], controllers: [MentorshipController] })
export class MentorshipModule {}
