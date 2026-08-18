import { redirect } from 'next/navigation';

type Props = {
  params: Promise<{ vodId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LegacyHighlightMomentsPage({
  params,
  searchParams,
}: Props) {
  const [{ vodId }, query] = await Promise.all([params, searchParams]);
  const nextParams = new URLSearchParams({ view: 'highlights' });

  for (const [key, value] of Object.entries(query)) {
    if (key === 'view' || value === undefined) {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        nextParams.append(key, item);
      }
    } else {
      nextParams.set(key, value);
    }
  }

  redirect(`/archives/${encodeURIComponent(vodId)}?${nextParams.toString()}`);
}
