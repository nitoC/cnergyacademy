'use client';
import { useMutation } from '@tanstack/react-query';
import { MessageSquarePlus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { errorMessage, post } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Callout, Dialog } from '@/components/ui/Feedback';
import { TextArea, TextField } from '@/components/ui/Field';

/** Opens a support thread with the course creator or its mentors. */
export function AskQuestion({ courseId, lessonId, lessonTitle }: { courseId: string; lessonId?: string; lessonTitle?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState(lessonTitle ? `Question about “${lessonTitle}”` : '');
  const [body, setBody] = useState('');
  const create = useMutation({
    mutationFn: () => post<{ id: string }>('/support-threads', { courseId, lessonId, subject, body }),
    onSuccess: (t) => router.push(`/support/${t.id}`),
  });
  return (
    <>
      <Button variant="secondary" block icon={<MessageSquarePlus size={15} />} onClick={() => setOpen(true)}>
        Ask a mentor
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Ask a mentor"
        actions={
          <>
            <Button variant="tertiary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" loading={create.isPending} disabled={subject.trim().length < 4 || body.trim().length < 2} onClick={() => create.mutate()}>
              Send question
            </Button>
          </>
        }
      >
        <p style={{ fontSize: '0.88rem', color: 'var(--ink-2)' }}>The course creator or an assigned mentor will reply. You will be notified.</p>
        {create.error && <Callout tone="danger">{errorMessage(create.error)}</Callout>}
        <TextField label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={160} />
        <TextArea label="Your question" value={body} onChange={(e) => setBody(e.target.value)} rows={5} maxLength={8000} />
      </Dialog>
    </>
  );
}
