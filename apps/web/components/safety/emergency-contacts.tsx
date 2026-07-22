'use client';

import { useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { useTranslations } from 'next-intl';
import { Loader2, Pencil, Plus, Trash2, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Field } from '@/components/auth/field';
import { FormBanner } from '@/components/auth/form-banner';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import { ApiError } from '@/lib/api-error';
import {
  EMERGENCY_CONTACTS_QUERY,
  type EmergencyContact,
  type EmergencyContactsQueryResult,
} from '@/lib/graphql/safety';
import {
  addEmergencyContact,
  removeEmergencyContact,
  updateEmergencyContact,
  type EmergencyContactInput,
} from '@/lib/safety';

/**
 * Emergency-contact management (SOS-02): the people alerted when an SOS fires.
 *
 * These are not TrustPro accounts — a neighbour, a family member — so they are
 * captured as name + phone (+ optional email), and the SOS share fans out to them
 * directly. The list is what makes the SOS meaningful: an alert with no contacts
 * has nobody to reach, so the empty state pushes hard toward adding one.
 */
export function EmergencyContacts() {
  const t = useTranslations('Safety');
  const { data, loading, refetch } = useQuery<EmergencyContactsQueryResult>(
    EMERGENCY_CONTACTS_QUERY,
    { fetchPolicy: 'cache-and-network', errorPolicy: 'all' },
  );

  const contacts = data?.myEmergencyContacts ?? [];

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-heading text-lg font-semibold text-foreground">
            {t('contacts.title')}
          </h2>
          <p className="text-sm text-muted-foreground">{t('contacts.subtitle')}</p>
        </div>
        <ContactDialog
          onSaved={() => void refetch()}
          trigger={
            <Button size="sm" className="shrink-0 gap-1.5">
              <Plus aria-hidden className="size-4" />
              {t('contacts.add')}
            </Button>
          }
        />
      </div>

      {loading && contacts.length === 0 ? (
        <Skeleton className="h-24 w-full rounded-card" />
      ) : contacts.length === 0 ? (
        <p className="rounded-card border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {t('contacts.empty')}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-card border border-border">
          {contacts.map((contact) => (
            <ContactRow key={contact.id} contact={contact} onChanged={() => void refetch()} />
          ))}
        </ul>
      )}
    </section>
  );
}

function ContactRow({ contact, onChanged }: { contact: EmergencyContact; onChanged: () => void }) {
  const t = useTranslations('Safety');
  const { toast } = useToast();
  const [removing, setRemoving] = useState(false);

  const onRemove = async () => {
    setRemoving(true);
    try {
      await removeEmergencyContact(contact.id);
      toast({ title: t('contacts.removed') });
      onChanged();
    } catch (error) {
      toast({
        variant: 'danger',
        title: t('contacts.saveFailed'),
        description: error instanceof ApiError ? error.message : undefined,
      });
    } finally {
      setRemoving(false);
    }
  };

  return (
    <li className="flex items-center gap-3 bg-surface px-4 py-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <UserRound aria-hidden className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{contact.name}</p>
        <p className="truncate font-numeric text-sm text-muted-foreground">
          {contact.phone}
          {contact.relationship ? ` · ${contact.relationship}` : ''}
        </p>
      </div>
      <ContactDialog
        contact={contact}
        onSaved={onChanged}
        trigger={
          <Button variant="ghost" size="icon" aria-label={t('contacts.edit')}>
            <Pencil aria-hidden className="size-4" />
          </Button>
        }
      />
      <Button
        variant="ghost"
        size="icon"
        onClick={() => void onRemove()}
        disabled={removing}
        aria-label={t('contacts.remove')}
      >
        {removing ? (
          <Loader2 aria-hidden className="size-4 animate-spin" />
        ) : (
          <Trash2 aria-hidden className="size-4 text-danger" />
        )}
      </Button>
    </li>
  );
}

function ContactDialog({
  contact,
  onSaved,
  trigger,
}: {
  contact?: EmergencyContact;
  onSaved: () => void;
  trigger: React.ReactNode;
}) {
  const t = useTranslations('Safety');
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<EmergencyContactInput>({
    name: contact?.name ?? '',
    phone: contact?.phone ?? '',
    relationship: contact?.relationship ?? '',
    email: contact?.email ?? '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const payload: EmergencyContactInput = {
        name: form.name.trim(),
        phone: form.phone.trim(),
        ...(form.relationship?.trim() ? { relationship: form.relationship.trim() } : {}),
        ...(form.email?.trim() ? { email: form.email.trim() } : {}),
      };
      if (contact) {
        await updateEmergencyContact(contact.id, payload);
      } else {
        await addEmergencyContact(payload);
      }
      toast({ title: t('contacts.saved') });
      setOpen(false);
      onSaved();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('contacts.saveFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{contact ? t('contacts.edit') : t('contacts.add')}</DialogTitle>
        </DialogHeader>

        {error && <FormBanner tone="error" message={error} />}

        <div className="flex flex-col gap-3">
          <Field
            label={t('contacts.name')}
            name="name"
            value={form.name}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
          />
          <Field
            label={t('contacts.phone')}
            name="phone"
            type="tel"
            value={form.phone}
            onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
          />
          <Field
            label={t('contacts.relationship')}
            name="relationship"
            value={form.relationship ?? ''}
            onChange={(event) => setForm((prev) => ({ ...prev, relationship: event.target.value }))}
          />
          <Field
            label={t('contacts.email')}
            name="email"
            type="email"
            value={form.email ?? ''}
            onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>
            {t('contacts.cancel')}
          </Button>
          <Button
            onClick={() => void submit()}
            disabled={submitting || !form.name.trim() || !form.phone.trim()}
          >
            {submitting && <Loader2 aria-hidden className="animate-spin" />}
            {t('contacts.save')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
