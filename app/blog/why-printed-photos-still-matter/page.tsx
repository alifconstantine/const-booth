import { Metadata } from 'next';
import ClientPageRenderer from '@/app/components/ClientPageRenderer';
import pageData from './pageData.json';

export const metadata: Metadata = {
  title: pageData.title,
  description: pageData.description,
};

export default function Page() {
  return (
    <ClientPageRenderer
      html={pageData.html}
      styles={pageData.styles}
      bodyClass={pageData.bodyClass}
      bodyAttrs={pageData.bodyAttrs}
    />
  );
}
