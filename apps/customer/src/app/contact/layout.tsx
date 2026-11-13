import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'اتصل بنا | Contact us',
  description:
    'تواصل مع أوريكس لخدمات السيارات — الهاتف والبريد والفروع وساعات العمل. Contact ORYX Auto Services: phone, email, branches and opening hours.',
  alternates: { canonical: '/contact' },
  openGraph: { url: '/contact', images: ['/media/about-workshop.jpg'] },
};

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return children;
}
