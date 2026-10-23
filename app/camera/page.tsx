import { Metadata } from 'next';
import ClientPageRenderer from '@/app/components/ClientPageRenderer';
import pageData from './pageData.json';
import { getBoothState } from '../api/temp-store';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '@/convex/_generated/api';

export const metadata: Metadata = {
  title: pageData.title,
  description: pageData.description,
};

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL || 'https://knowing-barracuda-495.convex.cloud';
const convex = convexUrl ? new ConvexHttpClient(convexUrl) : null;

export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<{ booth?: string }>;
}) {
  const resolvedParams = searchParams ? await searchParams : {};
  const boothId = resolvedParams?.booth;
  let boothState: any = boothId ? getBoothState(boothId) : null;

  if (!boothState && boothId && convex) {
    try {
      boothState = await convex.query(api.booths.getBooth, { boothId });
    } catch (_e) {}
  }

  return (
    <>
      {boothState && (
        <script
          id="pre-sync-booth"
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var __pTmpl = ${JSON.stringify(boothState.template || null)};
                var __pStyle = ${JSON.stringify(boothState.stripStyle || null)};
                var __pMode = ${JSON.stringify(boothState.outputMode || 'strip')};
                if (__pTmpl) localStorage.setItem("jepretoTemplate", JSON.stringify(__pTmpl));
                if (__pStyle) localStorage.setItem("stripStyle", __pStyle);
                if (__pMode) localStorage.setItem("outputMode", __pMode);
              } catch(e) {}
            `,
          }}
        />
      )}
      <ClientPageRenderer
        html={pageData.html}
        styles={pageData.styles}
        bodyClass={pageData.bodyClass}
        bodyAttrs={pageData.bodyAttrs}
      />
    </>
  );
}
