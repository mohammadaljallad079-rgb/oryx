import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'عن أوريكس | About ORYX',
  description:
    'تعرف على أوريكس لخدمات السيارات — خبرتنا في صيانة وإصلاح وفحص السيارات وقطع الغيار في البحرين. About ORYX Auto Services in Bahrain.',
  alternates: { canonical: '/about' },
  openGraph: { url: '/about', images: ['/media/about-workshop.jpg'] },
};

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return children;
}
