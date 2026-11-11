export type LinkPreview = {
  path: string;
  title: string;
  description: string;
  image: string;
  alt: string;
};

export const LINK_PREVIEWS: LinkPreview[] = [
  {
    path: '/',
    title: 'WaterMarket',
    description: 'Fresh Solutions. Everyday. Water refilling, ice cubes, and laundry in Kalibo, Aklan.',
    image: '/og-home.jpg',
    alt: 'WaterMarket station and delivery tricycle in Andagao, Kalibo',
  },
  {
    path: '/about',
    title: 'About WaterMarket',
    description: 'Water refilling, ice, and laundry from our station on Ilang-Ilang Road, Andagao, Kalibo.',
    image: '/og-home.jpg',
    alt: 'WaterMarket station and delivery tricycle in Andagao, Kalibo',
  },
  {
    path: '/contact',
    title: 'Contact WaterMarket',
    description: 'Visit Ilang-Ilang Road, Andagao, Kalibo, or call 0920-627-1104. We are here to help.',
    image: '/og-home.jpg',
    alt: 'WaterMarket station and delivery tricycle in Andagao, Kalibo',
  },
  {
    path: '/water-refilling',
    title: 'Water Refilling | WaterMarket',
    description: 'Purified drinking water with delivery from WaterMarket in Kalibo, Aklan.',
    image: '/og-water.jpg',
    alt: 'WaterMarket delivery truck loaded with water containers',
  },
  {
    path: '/ice-cubes',
    title: 'Ice Cubes | WaterMarket',
    description: 'Pure, clean ice cubes for homes, stores, and events. Order from WaterMarket in Kalibo.',
    image: '/og-ice.jpg',
    alt: 'WaterMarket ice delivery fleet at the Kalibo station',
  },
  {
    path: '/laundry',
    title: 'Laundry Service | WaterMarket',
    description: 'Wash, dry, fold, and delivery. Book laundry with WaterMarket in Kalibo, Aklan.',
    image: '/og-laundry.jpg',
    alt: 'WaterMarket logo',
  },
];

export function previewForPath(pathname: string): LinkPreview {
  const path = pathname.split('?')[0].replace(/\/+$/, '') || '/';
  return LINK_PREVIEWS.find((item) => item.path === path) ?? LINK_PREVIEWS[0];
}

function setContent(selector: string, value: string) {
  const el = document.querySelector(selector);
  if (el) el.setAttribute('content', value);
}

/** Keeps the tab and share tags in step when someone moves between public pages. */
export function applyDocumentPreview(preview: LinkPreview) {
  document.title = preview.title;
  const image = new URL(preview.image, window.location.origin).href;
  const pageUrl = new URL(preview.path, window.location.origin).href;
  setContent('meta[name="description"]', preview.description);
  setContent('meta[property="og:title"]', preview.title);
  setContent('meta[property="og:description"]', preview.description);
  setContent('meta[property="og:url"]', pageUrl);
  setContent('meta[property="og:image"]', image);
  setContent('meta[property="og:image:secure_url"]', image);
  setContent('meta[property="og:image:alt"]', preview.alt);
  setContent('meta[name="twitter:title"]', preview.title);
  setContent('meta[name="twitter:description"]', preview.description);
  setContent('meta[name="twitter:image"]', image);
  setContent('meta[name="twitter:image:alt"]', preview.alt);
}
