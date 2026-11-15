import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'خدماتنا | Our services',
  description:
    'خدمات صيانة وإصلاح وفحص السيارات من أوريكس في البحرين. ORYX automotive maintenance, repair and inspection services in Bahrain.',
  alternates: { canonical: '/services' },
  openGraph: { url: '/services', images: ['/media/hero-services.jpg'] },
};

export default function ServicesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
