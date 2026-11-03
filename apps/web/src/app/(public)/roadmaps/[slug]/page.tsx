import { RoadmapView } from './RoadmapView';

export const metadata = { title: 'Roadmap' };

export default async function RoadmapPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <RoadmapView slug={slug} />;
}
