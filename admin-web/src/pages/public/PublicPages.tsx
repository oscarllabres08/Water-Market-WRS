import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';

import { money, publicWrsAssetUrl } from '../../lib/format';
import { supabase } from '../../lib/supabase';

const SERVICES = [
  { to: '/water-refilling', label: 'Water Refilling', icon: 'drop' as const },
  { to: '/ice-cubes', label: 'Ice Cubes', icon: 'ice' as const },
  { to: '/laundry', label: 'Laundry', icon: 'shirt' as const },
];

function Icon({ name }: { name: 'drop' | 'ice' | 'shirt' | 'phone' | 'rider' | 'truck' | 'calendar' | 'check' }) {
  const common = { viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true as const };
  if (name === 'ice') {
    return (
      <svg {...common}>
        <path d="M8 4h8l4 6-8 10L4 10l4-6z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
        <path d="M8 4l4 6 4-6M4 10h16M12 10v10" stroke="currentColor" strokeWidth="1.7" />
      </svg>
    );
  }
  if (name === 'shirt') {
    return (
      <svg {...common}>
        <path d="M8 5l4 2 4-2 4 3-2 3v9H6V11L4 8l4-3z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      </svg>
    );
  }
  if (name === 'phone') {
    return (
      <svg {...common}>
        <rect x="7" y="2.5" width="10" height="19" rx="2.2" stroke="currentColor" strokeWidth="1.7" />
        <path d="M11 18.5h2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    );
  }
  if (name === 'rider') {
    return (
      <svg {...common}>
        <circle cx="6.5" cy="17" r="2.4" stroke="currentColor" strokeWidth="1.7" />
        <circle cx="17.5" cy="17" r="2.4" stroke="currentColor" strokeWidth="1.7" />
        <path d="M6.5 17h4l2.2-5H16l2 5M10 12l1.5-4H16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (name === 'truck') {
    return (
      <svg {...common}>
        <path d="M3 7h11v8H3V7zM14 10h4l3 3v2h-7v-5z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
        <circle cx="7" cy="17.5" r="1.6" fill="currentColor" />
        <circle cx="17" cy="17.5" r="1.6" fill="currentColor" />
      </svg>
    );
  }
  if (name === 'calendar') {
    return (
      <svg {...common}>
        <rect x="4" y="5" width="16" height="15" rx="2" stroke="currentColor" strokeWidth="1.7" />
        <path d="M8 3.5V7M16 3.5V7M4 10h16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    );
  }
  if (name === 'check') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.7" />
        <path d="M8.5 12.2l2.3 2.3 4.7-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M12 3.2c2.8 3.6 5.2 6.4 5.2 9.2a5.2 5.2 0 11-10.4 0c0-2.8 2.4-5.6 5.2-9.2z" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function DropLogo() {
  return <img className="wm-logo" src="/logo.png" alt="" />;
}

function friendly(message: string | null) {
  if (!message) return null;
  if (/schema cache|does not exist|relation|could not find/i.test(message)) return null;
  return message;
}

function BookingDate({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const shown = value
    ? new Date(`${value}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
    : 'Select Date';

  function openCalendar() {
    const node = ref.current;
    if (!node) return;
    if (typeof node.showPicker === 'function') {
      try {
        node.showPicker();
        return;
      } catch {
        node.focus();
      }
    }
    node.focus();
  }

  return (
    <label>
      Select Date
      <span className="wm-date-face">
        <button type="button" className="wm-date-icon" aria-label="Open calendar" onClick={openCalendar}>
          <Icon name="calendar" />
        </button>
        <span>{shown}</span>
        <input ref={ref} type="date" value={value} required onChange={(event) => onChange(event.target.value)} />
      </span>
    </label>
  );
}

export function PublicLayout() {
  const location = useLocation();
  const dropRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [dark, setDark] = useState(() => {
    try {
      return localStorage.getItem('watermarket-public-theme') === 'dark';
    } catch {
      return false;
    }
  });
  const onService = SERVICES.some((item) => location.pathname === item.to);

  function toggleDark() {
    setDark((value) => {
      const next = !value;
      try {
        localStorage.setItem('watermarket-public-theme', next ? 'dark' : 'light');
      } catch {
        /* ignore storage errors */
      }
      return next;
    });
  }

  useEffect(() => {
    setOpen(false);
    setMenu(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!menu) return;
    function onPointer(event: PointerEvent) {
      if (!dropRef.current?.contains(event.target as Node)) setMenu(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setMenu(false);
    }
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [menu]);

  useLayoutEffect(() => {
    const main = document.querySelector('.wm-public main');
    if (!main) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const mobile = window.matchMedia('(max-width: 900px)').matches;
    const picked = [
      ...main.querySelectorAll(
        '.wm-hero, .wm-ice-hero, .wm-service, .wm-trust, .wm-about-band, .wm-about-photo, .wm-gallery, .wm-shot, .wm-ice-perks, .wm-ice-card, .wm-ice-book, .wm-principles, .wm-offer, .wm-app, .wm-product, .wm-panel, .wm-facts, .wm-story, .wm-ly-grid, ul.wm-promises, .wm-contact-card, .wm-contact-map, .wm-contact-extra, .wm-contact-answers'
      ),
    ].filter((node, _, all) => !all.some((other) => other !== node && node.contains(other)));

    picked.forEach((node) => {
      const el = node as HTMLElement;
      el.classList.add('wm-reveal');
      const group = [...(el.parentElement?.children ?? [])].filter((child) => picked.includes(child));
      const index = Math.max(0, group.indexOf(el));
      el.style.setProperty('--wm-d', `${Math.min(index, 6) * (mobile ? 80 : 60)}ms`);
      if (mobile && index % 2 === 1) el.classList.add('wm-reveal-side');
    });

    if (reduce) {
      picked.forEach((node) => node.classList.add('is-in'));
      return;
    }

    function reveal() {
      picked.forEach((node) => {
        if (node.classList.contains('is-in')) return;
        const rect = node.getBoundingClientRect();
        if (rect.top < window.innerHeight * 0.9 && rect.bottom > 0) node.classList.add('is-in');
      });
    }

    const frame = requestAnimationFrame(() => requestAnimationFrame(reveal));
    window.addEventListener('scroll', reveal, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', reveal);
    };
  }, [location.pathname]);

  return (
    <div className={`wm-public${dark ? ' is-dark' : ''}`}>
      <header className="wm-top">
        <Link to="/" className="wm-brand">
          <DropLogo />
          <span>
            <strong>WaterMarket</strong>
            <small>Fresh Solutions. Everyday.</small>
          </span>
        </Link>
        <nav className={`wm-nav${open ? ' is-open' : ''}`} aria-label="WaterMarket">
          <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : undefined)}>
            Home
          </NavLink>
          <NavLink to="/about" className={({ isActive }) => (isActive ? 'active' : undefined)}>
            About Us
          </NavLink>
          <div ref={dropRef} className={`wm-drop${menu || onService ? ' is-current' : ''}`}>
            <button
              type="button"
              className={onService ? 'active' : undefined}
              aria-expanded={menu}
              onClick={() => setMenu((value) => !value)}
            >
              Products & Services
              <span aria-hidden>▾</span>
            </button>
            {menu ? (
              <div className="wm-drop-menu" role="menu">
                {SERVICES.map((item) => (
                  <Link key={item.to} to={item.to} role="menuitem">
                    <span className="wm-mini">
                      <Icon name={item.icon} />
                    </span>
                    {item.label}
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
          <NavLink to="/contact" className={({ isActive }) => (isActive ? 'active' : undefined)}>
            Contact
          </NavLink>
        </nav>
        <button
          type="button"
          className={`wm-theme${dark ? ' is-on' : ''}`}
          role="switch"
          aria-checked={dark}
          aria-label={dark ? 'Dark mode on' : 'Dark mode off'}
          onClick={toggleDark}
        >
          <span className="wm-theme-track" aria-hidden>
            <span />
          </span>
          <span>{dark ? 'Dark on' : 'Dark off'}</span>
        </button>
        <button type="button" className="wm-burger" aria-expanded={open} aria-label={open ? 'Close menu' : 'Open menu'} onClick={() => setOpen((value) => !value)}>
          <span />
          <span />
          <span />
        </button>
      </header>
      <Outlet />
      <footer className="wm-footer">
        <DropLogo />
        <div>
          <strong>WaterMarket</strong>
          <p>Fresh Solutions. Everyday.</p>
        </div>
      </footer>
    </div>
  );
}

const HOME_CARDS = [
  { to: '/water-refilling', label: 'Water Refilling', note: 'Pure and Safe Water for Your Family', icon: 'drop' as const },
  { to: '/ice-cubes', label: 'Ice Cubes', note: 'Keep It Cool All Day Long', icon: 'ice' as const },
  { to: '/laundry', label: 'Laundry', note: 'Clean and Fresh Always', icon: 'shirt' as const },
];

function TrustIcon({ name }: { name: 'shield' | 'rider' | 'thumb' | 'support' }) {
  const common = { viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true as const };
  if (name === 'shield') {
    return (
      <svg {...common}>
        <path d="M12 3.5l7 2.5v6.2c0 4.2-2.8 6.8-7 8.3-4.2-1.5-7-4.1-7-8.3V6l7-2.5z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
        <path d="M9 12.1l2 2 4-4.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    );
  }
  if (name === 'thumb') {
    return (
      <svg {...common}>
        <path d="M8 11.5V20H5.5A1.5 1.5 0 014 18.5v-5A1.5 1.5 0 015.5 12H8zM8 11.5l2.2-5.2A1.8 1.8 0 0112 5.2V10h5.2a1.8 1.8 0 011.8 2.1l-.8 6A1.8 1.8 0 0116.4 20H8" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      </svg>
    );
  }
  if (name === 'support') {
    return (
      <svg {...common}>
        <path d="M4.5 13V11a7.5 7.5 0 0115 0v2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        <rect x="3.5" y="12" width="4" height="6" rx="1.4" stroke="currentColor" strokeWidth="1.7" />
        <rect x="16.5" y="12" width="4" height="6" rx="1.4" stroke="currentColor" strokeWidth="1.7" />
        <path d="M18.5 18v1a2.5 2.5 0 01-2.5 2.5H13" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    );
  }
  return <Icon name="rider" />;
}

export function HomePage() {
  return (
    <main className="wm-home">
      <section className="wm-hero wm-hero-home">
        <div className="wm-hero-copy">
          <p className="wm-kicker">Welcome to WaterMarket</p>
          <h1>
            Fresh Solutions.
            <span>Everyday.</span>
          </h1>
          <p className="wm-lead">Your trusted partner for Water Refilling, Ice Cubes, and Laundry services — all in one convenient place.</p>
          <a href="#services" className="wm-btn">
            Explore Our Services <span aria-hidden>→</span>
          </a>
        </div>
        <figure className="wm-hero-photo">
          <img src="/store.png" alt="WaterMarket storefront with the station sign and delivery tricycle" />
        </figure>
      </section>

      <section id="services" className="wm-service-row">
        {HOME_CARDS.map((item) => (
          <Link key={item.to} to={item.to} className="wm-service">
            <span className="wm-service-icon">
              <Icon name={item.icon} />
            </span>
            <span>
              <strong>{item.label}</strong>
              <small>{item.note}</small>
            </span>
            <span className="wm-service-go" aria-hidden>→</span>
          </Link>
        ))}
      </section>

      <ul className="wm-trust">
        <li>
          <TrustIcon name="shield" />
          <span><strong>Trusted & Reliable</strong><small>Quality You Can Count On</small></span>
        </li>
        <li>
          <TrustIcon name="rider" />
          <span><strong>Fast & Convenient</strong><small>Service at Your Doorstep</small></span>
        </li>
        <li>
          <TrustIcon name="thumb" />
          <span><strong>Affordable Prices</strong><small>Great Value for Your Money</small></span>
        </li>
        <li>
          <TrustIcon name="support" />
          <span><strong>Dedicated Support</strong><small>Always Here to Help</small></span>
        </li>
      </ul>

      <section className="wm-about-band">
        <div>
          <p className="wm-kicker">About WaterMarket</p>
          <h2>More Than Just a Store, A Complete Solution.</h2>
          <p>At WaterMarket, we bring you quality water, refreshing ice, and professional laundry services — designed for your convenience and peace of mind.</p>
          <Link to="/about" className="wm-btn">Learn More <span aria-hidden>→</span></Link>
        </div>
        <figure className="wm-about-photo">
          <img src="/store3.png" alt="WaterMarket station with delivery tricycles and the ice truck parked in front" />
        </figure>
      </section>

      <section className="wm-gallery">
        <div className="wm-gallery-copy">
          <p className="wm-kicker">Our Services</p>
          <h2>Everything You Need, All in One Place</h2>
        </div>
        <div className="wm-gallery-grid">
          <Link to="/water-refilling" className="wm-shot wm-shot-water">
            <img src="/store.png" alt="" />
            <span>
              <strong>Water Refilling</strong>
              <small>Pure, Safe, Refreshing.</small>
              <em aria-hidden>→</em>
            </span>
          </Link>
          <Link to="/ice-cubes" className="wm-shot wm-shot-ice">
            <img src="/store.png" alt="" />
            <span>
              <strong>Ice Cubes</strong>
              <small>Keep it Cool.</small>
              <em aria-hidden>→</em>
            </span>
          </Link>
          <Link to="/laundry" className="wm-shot wm-shot-laundry">
            <img src="/store.png" alt="" />
            <span>
              <strong>Laundry</strong>
              <small>Clean, Fresh, Ready.</small>
              <em aria-hidden>→</em>
            </span>
          </Link>
        </div>
      </section>
    </main>
  );
}

function MarkIcon({ name }: { name: 'target' | 'eye' | 'gem' | 'people' }) {
  const common = { viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true as const };
  if (name === 'target') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.7" />
        <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.7" />
        <circle cx="12" cy="12" r="1.2" fill="currentColor" />
      </svg>
    );
  }
  if (name === 'eye') {
    return (
      <svg {...common}>
        <path d="M2.8 12S6.4 6.5 12 6.5 21.2 12 21.2 12 17.6 17.5 12 17.5 2.8 12 2.8 12z" stroke="currentColor" strokeWidth="1.7" />
        <circle cx="12" cy="12" r="2.4" stroke="currentColor" strokeWidth="1.7" />
      </svg>
    );
  }
  if (name === 'gem') {
    return (
      <svg {...common}>
        <path d="M4 9l3.2-4h9.6L20 9l-8 11L4 9z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
        <path d="M4 9h16M9.2 5L8 9l4 11 4-11-1.2-4" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="9" cy="9" r="2.2" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="16" cy="10" r="1.8" stroke="currentColor" strokeWidth="1.7" />
      <path d="M4.5 18.5c.6-2.4 2.4-3.6 4.5-3.6s3.9 1.2 4.5 3.6M13 18.5c.3-1.6 1.4-2.5 3-2.5 1.3 0 2.3.6 2.8 1.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

const ABOUT_OFFERS = [
  { to: '/water-refilling', title: 'Water Refilling', note: 'Pure and safe drinking water for your family.', icon: 'drop' as const, image: '/store2.png', wash: '' },
  { to: '/ice-cubes', title: 'Ice Cubes', note: 'Stay cool with our high-quality ice.', icon: 'ice' as const, image: '', wash: 'wm-offer-ice' },
  { to: '/laundry', title: 'Laundry', note: 'Clean and fresh, always.', icon: 'shirt' as const, image: '', wash: 'wm-offer-wash' },
];

const ABOUT_MARKS = [
  { icon: 'target' as const, title: 'Our Mission', text: 'To provide quality water, ice, and laundry services with dependable and friendly service.' },
  { icon: 'eye' as const, title: 'Our Vision', text: 'To be the most trusted and preferred fresh solutions provider in our community.' },
  { icon: 'gem' as const, title: 'Our Values', text: 'Integrity, customer focus, quality, and service excellence.' },
  { icon: 'people' as const, title: 'Our Commitment', text: 'Your satisfaction is our priority, every day.' },
];

export function AboutPage() {
  return (
    <main className="wm-home">
      <section className="wm-hero wm-hero-home">
        <div className="wm-hero-copy">
          <p className="wm-kicker">About Us</p>
          <h1>
            WaterMarket
            <span>Fresh Solutions. Everyday.</span>
          </h1>
          <p className="wm-lead">Your trusted partner for water refilling, ice cubes, and laundry services — all in one convenient place.</p>
          <ul className="wm-facts">
            <li>
              <strong>Address</strong>
              <span>Ilang-Ilang Road, Andagao, Kalibo, Aklan</span>
            </li>
            <li>
              <strong>Telephone</strong>
              <span>268-7983 · 268-8719</span>
            </li>
            <li>
              <strong>Mobile</strong>
              <span>0920-627-1104</span>
            </li>
          </ul>
        </div>
        <figure className="wm-hero-photo">
          <img src="/store.png" alt="WaterMarket station on Ilang-Ilang Road, Andagao, Kalibo" />
        </figure>
      </section>

      <section className="wm-story">
        <div>
          <p className="wm-kicker">Our Story</p>
          <h2>Serving Our Community with Freshness and Care</h2>
          <p>
            WaterMarket serves Kalibo from our station on Ilang-Ilang Road, Andagao. We started with water refilling and now bring ice and laundry to the same neighborhood, with the same care for every home and business.
          </p>
          <p>We are committed to delivering freshness, convenience, and reliability to every home and business we serve.</p>
          <Link to="/contact" className="wm-btn">Learn More About Us <span aria-hidden>→</span></Link>
        </div>
        <div className="wm-offer-row">
          {ABOUT_OFFERS.map((item) => (
            <Link key={item.to} to={item.to} className="wm-offer">
              <span className="wm-offer-photo">
                {item.image ? <img src={item.image} alt="" /> : <span className={item.wash} />}
                <span className="wm-offer-badge"><Icon name={item.icon} /></span>
              </span>
              <strong>{item.title}</strong>
              <small>{item.note}</small>
            </Link>
          ))}
        </div>
      </section>

      <ul className="wm-principles">
        {ABOUT_MARKS.map((item) => (
          <li key={item.title}>
            <MarkIcon name={item.icon} />
            <span>
              <strong>{item.title}</strong>
              <small>{item.text}</small>
            </span>
          </li>
        ))}
      </ul>
    </main>
  );
}

export function ContactPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [topic, setTopic] = useState('');
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);

  function submit(event: FormEvent) {
    event.preventDefault();
    const body = [`Name: ${name}`, `Email: ${email}`, `Phone: ${phone}`, `Topic: ${topic || 'General'}`, '', message].join('\n');
    window.location.href = `mailto:info@watermarket.ph?subject=${encodeURIComponent(`WaterMarket: ${topic || 'Message'}`)}&body=${encodeURIComponent(body)}`;
    setSent(true);
  }

  return (
    <main className="wm-contact">
      <section className="wm-ice-hero wm-contact-hero">
        <div className="wm-ice-copy">
          <h1>Contact Us</h1>
          <p className="wm-ice-sub">We’d love to hear from you!</p>
          <p className="wm-lead">Get in touch with us for inquiries, bookings, or any concerns. We’re here to help!</p>
        </div>
        <div className="wm-contact-art" aria-hidden>
          <p className="wm-ice-script">Your Satisfaction is Our Priority!</p>
          <img src="/store.png" alt="" />
        </div>
      </section>

      <div className="wm-contact-layout">
        <section className="wm-contact-details">
          <h2><ContactGlyph name="pin" /> Our Contact Details</h2>
          <div className="wm-contact-cards">
            <article className="wm-contact-card">
              <ContactGlyph name="phone" />
              <div>
                <strong>Phone Number</strong>
                <a href="tel:2687983">268-7983</a>
                <small><span>268-8719</span> · <span>0920-627-1104</span></small>
              </div>
            </article>
            <article className="wm-contact-card">
              <ContactGlyph name="mail" />
              <div>
                <strong>Email Address</strong>
                <a href="mailto:info@watermarket.ph">info@watermarket.ph</a>
              </div>
            </article>
            <article className="wm-contact-card">
              <ContactGlyph name="pin" />
              <div>
                <strong>Our Location</strong>
                <span>Andagao, Kalibo, Aklan</span>
              </div>
            </article>
            <article className="wm-contact-card">
              <ContactGlyph name="clock" />
              <div>
                <strong>Business Hours</strong>
                <span>Mon–Sat, 7 AM–7 PM</span>
                <small>Sun, 8 AM–5 PM</small>
              </div>
            </article>
          </div>
          <figure className="wm-contact-map">
            <iframe
              title="WaterMarket station in Andagao, Kalibo"
              src="https://maps.google.com/maps?q=Ilang-Ilang%20Road%2C%20Andagao%2C%20Kalibo%2C%20Aklan&z=16&output=embed"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              allowFullScreen
            />
            <figcaption>
              <strong>WaterMarket</strong>
              <span>Ilang-Ilang Road, Andagao, Kalibo, Aklan</span>
              <a href="https://www.google.com/maps/search/?api=1&query=Ilang-Ilang%20Road%2C%20Andagao%2C%20Kalibo%2C%20Aklan" target="_blank" rel="noreferrer">
                View larger map
              </a>
            </figcaption>
          </figure>
        </section>

        <form className="wm-ice-book wm-contact-form" onSubmit={submit}>
          <h2><ContactGlyph name="send" /> Send Us a Message</h2>
          <p>Fill out the form below and we’ll get back to you as soon as possible.</p>
          {sent ? <p className="wm-done">Your email app should open with this message. Send it to reach the station.</p> : null}
          <div className="wm-contact-pair">
            <label className="wm-field">
              <ContactGlyph name="user" />
              <input aria-label="Full Name" placeholder="Full Name *" value={name} onChange={(event) => setName(event.target.value)} required />
            </label>
            <label className="wm-field">
              <ContactGlyph name="mail" />
              <input aria-label="Email Address" type="email" placeholder="Email Address *" value={email} onChange={(event) => setEmail(event.target.value)} required />
            </label>
          </div>
          <label className="wm-field">
            <ContactGlyph name="phone" />
            <input aria-label="Phone Number" placeholder="Phone Number *" value={phone} onChange={(event) => setPhone(event.target.value)} required />
          </label>
          <label className="wm-field">
            <ContactGlyph name="list" />
            <select aria-label="Inquiry Type" value={topic} onChange={(event) => setTopic(event.target.value)}>
              <option value="">Select a topic</option>
              <option>Water refilling</option>
              <option>Ice cubes</option>
              <option>Laundry</option>
              <option>Delivery</option>
              <option>Other</option>
            </select>
          </label>
          <label className="wm-field wm-field-note">
            <ContactGlyph name="note" />
            <textarea aria-label="Your Message" value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Type your message here..." required rows={4} />
          </label>
          <button className="wm-btn wm-btn-block" type="submit">
            <ContactGlyph name="send" /> Send Message
          </button>
        </form>
      </div>

      <section className="wm-contact-extra">
        <div className="wm-contact-faq">
          <span className="wm-contact-badge"><ContactGlyph name="help" /></span>
          <div>
            <h2>Frequently Asked Questions</h2>
            <p>Find answers to common questions about our services.</p>
          </div>
          <a className="wm-btn wm-btn-line" href="#faq-list">View FAQs</a>
        </div>
        <div className="wm-contact-follow">
          <h2>Follow Us</h2>
          <p>Stay connected with us for updates and promos.</p>
          <div className="wm-contact-social" aria-label="Social pages are not linked yet">
            <span title="Facebook"><SocialGlyph name="facebook" /></span>
            <span title="Messenger"><SocialGlyph name="messenger" /></span>
            <span title="TikTok"><SocialGlyph name="tiktok" /></span>
            <span title="YouTube"><SocialGlyph name="youtube" /></span>
          </div>
        </div>
        <div className="wm-contact-support">
          <ContactGlyph name="headset" />
          <strong>24/7</strong>
          <span>Support</span>
        </div>
      </section>

      <div id="faq-list" className="wm-contact-answers">
        <details open>
          <summary>How do I order water?</summary>
          <p>Use the customer app from the Water Refilling page.</p>
        </details>
        <details>
          <summary>How do I book ice or laundry?</summary>
          <p>Open Ice Cubes or Laundry and send the booking form.</p>
        </details>
        <details>
          <summary>Where is the station?</summary>
          <p>Ilang-Ilang Road, Andagao, Kalibo, Aklan. Call 268-7983 or 0920-627-1104.</p>
        </details>
      </div>
    </main>
  );
}

function ContactGlyph({ name }: { name: 'pin' | 'phone' | 'mail' | 'clock' | 'send' | 'help' | 'user' | 'list' | 'note' | 'headset' }) {
  const common = { viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true as const };
  if (name === 'mail') {
    return <svg {...common}><rect x="3.5" y="5.5" width="17" height="13" rx="2" stroke="currentColor" strokeWidth="1.7" /><path d="M4 7l8 6 8-6" stroke="currentColor" strokeWidth="1.7" /></svg>;
  }
  if (name === 'clock') {
    return <svg {...common}><circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.7" /><path d="M12 8v4.5L15 15" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>;
  }
  if (name === 'send') {
    return <svg {...common}><path d="M4 12l16-7-6 16-2.5-6.5L4 12z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /></svg>;
  }
  if (name === 'help') {
    return <svg {...common}><circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.7" /><path d="M9.5 9.5a2.5 2.5 0 114 2c-.8.6-1.5 1.1-1.5 2.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /><circle cx="12" cy="16.5" r="0.8" fill="currentColor" /></svg>;
  }
  if (name === 'user') {
    return <svg {...common}><circle cx="12" cy="8" r="3" stroke="currentColor" strokeWidth="1.7" /><path d="M5.5 19c1.2-3 3.4-4.5 6.5-4.5s5.3 1.5 6.5 4.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>;
  }
  if (name === 'list') {
    return <svg {...common}><rect x="4" y="4" width="16" height="16" rx="3" stroke="currentColor" strokeWidth="1.7" /><path d="M8 9h8M8 12h8M8 15h5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>;
  }
  if (name === 'note') {
    return <svg {...common}><path d="M7 4.5h7l4 4V19a1.5 1.5 0 01-1.5 1.5h-9.5A1.5 1.5 0 015.5 19V6A1.5 1.5 0 017 4.5z" stroke="currentColor" strokeWidth="1.7" /><path d="M14 4.5V9h4.5" stroke="currentColor" strokeWidth="1.7" /></svg>;
  }
  if (name === 'headset') {
    return <svg {...common}><path d="M4 13v-1a8 8 0 0116 0v1" stroke="currentColor" strokeWidth="1.7" /><rect x="3" y="13" width="4" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.7" /><rect x="17" y="13" width="4" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.7" /></svg>;
  }
  if (name === 'phone') return <Icon name="phone" />;
  return <svg {...common}><path d="M12 21s6-5.2 6-10a6 6 0 10-12 0c0 4.8 6 10 6 10z" stroke="currentColor" strokeWidth="1.7" /><circle cx="12" cy="11" r="2" stroke="currentColor" strokeWidth="1.7" /></svg>;
}

function SocialGlyph({ name }: { name: 'facebook' | 'messenger' | 'tiktok' | 'youtube' }) {
  const common = { viewBox: '0 0 24 24', 'aria-hidden': true as const };
  if (name === 'facebook') {
    return <svg {...common}><path fill="currentColor" d="M14.5 8.5V6.8c0-.7.5-1 1.2-1H17V3h-2.1C12.2 3 11 4.4 11 6.6v1.9H9v2.7h2V21h3.5v-9.8h2.3l.4-2.7h-2.7z" /></svg>;
  }
  if (name === 'messenger') {
    return <svg {...common}><path fill="currentColor" d="M12 3C7 3 3.2 6.6 3.2 11.1c0 2.5 1.2 4.7 3.2 6.2V21l2.9-1.6c.8.2 1.7.4 2.7.4 5 0 8.8-3.6 8.8-8.1S17 3 12 3zm.9 10.8l-2.2-2.4-4.3 2.4 4.7-5 2.3 2.4 4.2-2.4-4.7 5z" /></svg>;
  }
  if (name === 'tiktok') {
    return <svg {...common}><path fill="currentColor" d="M14.2 3h2.2a5.2 5.2 0 003.4 3.2v2.3a7.4 7.4 0 01-3.4-1v6.3a5.6 5.6 0 11-5.6-5.6c.3 0 .6 0 .9.1v2.4a3.2 3.2 0 100 4.6 3.2 3.2 0 003.2-3.2V3z" /></svg>;
  }
  return <svg {...common}><path fill="currentColor" d="M21.5 7.2a2.5 2.5 0 00-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.7.4A2.5 2.5 0 002.5 7.2 26 26 0 002 12a26 26 0 00.5 4.8 2.5 2.5 0 001.8 1.8C5.8 19 12 19 12 19s6.2 0 7.7-.4a2.5 2.5 0 001.8-1.8A26 26 0 0022 12a26 26 0 00-.5-4.8zM10 15.5v-7l6 3.5-6 3.5z" /></svg>;
}

export function WaterRefillingPage() {
  const [pinOpen, setPinOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function verify(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const { data, error: err } = await supabase.rpc('verify_seller_download_pin', { p_pin: pin });
    setBusy(false);
    if (err) {
      setError(friendly(err.message) ?? 'PIN check is not ready yet. Ask the store to finish database setup.');
      return;
    }
    if (data === true) {
      setUnlocked(true);
      setPinOpen(false);
    } else setError('That PIN is not correct.');
  }

  return (
    <main>
      <section className="wm-hero wm-hero-water">
        <div className="wm-hero-copy">
          <h1>
            Water Refilling
            <span>Pure and Safe Drinking Water</span>
          </h1>
          <p className="wm-lead">Stay healthy with our purified water, now available for delivery.</p>
        </div>
        <figure className="wm-hero-art wm-art-water">
          <img src="/store2.png" alt="WaterMarket delivery tricycle parked at the station" />
        </figure>
      </section>
      <section className="wm-panel">
        <div className="wm-panel-head">
          <h2>Download Our Mobile Apps</h2>
          <p>Order water, track deliveries, and more.</p>
        </div>
        <div className="wm-app-row">
          <article className="wm-app">
            <span className="wm-service-icon"><Icon name="phone" /></span>
            <div>
              <strong>Customer App</strong>
              <small>for Online Orders</small>
            </div>
            <a className="wm-btn" href="/downloads/customer-app.apk" download>
              Download App <span aria-hidden>↓</span>
            </a>
          </article>
          <article className="wm-app">
            <span className="wm-pin">PIN Required</span>
            <span className="wm-service-icon"><Icon name="rider" /></span>
            <div>
              <strong>Rider App</strong>
              <small>for Riders Only</small>
            </div>
            {unlocked ? (
              <a className="wm-btn" href="/downloads/rider-app.apk" download>
                Download App <span aria-hidden>↓</span>
              </a>
            ) : (
              <button type="button" className="wm-btn" onClick={() => setPinOpen(true)}>
                Download App <span aria-hidden>↓</span>
              </button>
            )}
          </article>
          <p className="wm-script">Clean Water. Healthy Life.</p>
        </div>
      </section>
      {pinOpen ? (
        <div className="wm-modal" role="presentation" onClick={() => !busy && setPinOpen(false)}>
          <form className="wm-book" role="dialog" aria-labelledby="rider-pin-title" onClick={(event) => event.stopPropagation()} onSubmit={(event) => void verify(event)}>
            <h2 id="rider-pin-title">Rider app PIN</h2>
            <p>Authorized WaterMarket riders only. The PIN is set in WRS Settings.</p>
            <label htmlFor="rider-pin">PIN</label>
            <input id="rider-pin" type="password" value={pin} onChange={(event) => setPin(event.target.value)} required />
            {error ? <p className="wm-error">{error}</p> : null}
            <button className="wm-btn wm-btn-block" type="submit" disabled={busy}>{busy ? 'Checking…' : 'Unlock download'}</button>
          </form>
        </div>
      ) : null}
    </main>
  );
}

type IceProduct = {
  id: string;
  name: string;
  price: number;
  stock_quantity: number | null;
  image_url: string | null;
};

export function IceCubesPage() {
  const [products, setProducts] = useState<IceProduct[]>([]);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void supabase
      .from('products')
      .select('id,name,price,stock_quantity,image_url')
      .eq('category', 'ice')
      .eq('is_available', true)
      .order('sort_order')
      .then(({ data, error: err }) => {
        if (err) setError(friendly(err.message));
        setProducts((data ?? []) as IceProduct[]);
      });
  }, []);

  const chosen = useMemo(
    () => products.filter((product) => (qty[product.id] ?? 0) > 0).map((product) => ({ product_id: product.id, quantity: qty[product.id] })),
    [products, qty]
  );

  function orderProduct(id: string) {
    setActiveId(id);
    setQty((current) => ({ ...current, [id]: Math.max(1, current[id] ?? 0) }));
    document.getElementById('ice-order')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function changeActiveQty(next: number) {
    if (!activeId) return;
    const product = products.find((item) => item.id === activeId);
    const cap = product?.stock_quantity;
    const quantity = cap == null ? Math.max(1, next) : Math.min(Math.max(1, next), Math.max(cap, 1));
    setQty((current) => ({ ...current, [activeId]: quantity }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const when = [date, time].filter(Boolean).join(' ');
    const deliveryNote = when ? `Preferred delivery: ${when}` : '';
    const { data, error: err } = await supabase.rpc('create_public_ice_order', {
      p_customer_name: name,
      p_contact_number: phone,
      p_delivery_address: address,
      p_landmark: '',
      p_notes: deliveryNote,
      p_items: chosen,
    });
    setBusy(false);
    if (err) {
      setError(friendly(err.message) ?? 'Ice ordering is not open yet. The station still needs the database update.');
      return;
    }
    setOrderId((data as { order_id?: string } | null)?.order_id ?? 'saved');
  }

  const active = products.find((product) => product.id === activeId) ?? null;
  const activeQty = active ? qty[active.id] ?? 1 : 1;

  return (
    <main className="wm-ice">
      <div className="wm-ice-layout">
        <div className="wm-ice-main">
          <section className="wm-ice-hero">
            <div className="wm-ice-copy">
              <p className="wm-ice-badge">
                <Icon name="check" /> Premium Quality
              </p>
              <h1>Ice Cubes</h1>
              <p className="wm-ice-sub">Pure, Clean and Refreshing</p>
              <p className="wm-lead">Perfect for your business, events, and everyday needs.</p>
              <div className="wm-ice-actions">
                <a className="wm-btn" href="#ice-order">
                  <Icon name="calendar" /> Book Now <span aria-hidden>→</span>
                </a>
                <a className="wm-btn wm-btn-line" href="#ice-products">
                  <Icon name="ice" /> Order Now
                </a>
              </div>
            </div>
            <div className="wm-ice-art" aria-hidden>
              <p className="wm-ice-script">Stay Cool Always!</p>
              <span className="wm-ice-cube wm-ice-cube-a" />
              <span className="wm-ice-cube wm-ice-cube-b" />
              <span className="wm-ice-cube wm-ice-cube-c" />
              <span className="wm-ice-leaf" />
            </div>
          </section>

          <ul className="wm-ice-perks">
            <li><Icon name="ice" /><span><strong>100% Pure Ice</strong><small>Crystal Clear</small></span></li>
            <li><Icon name="check" /><span><strong>Hygienic & Safe</strong><small>For Your Health</small></span></li>
            <li><Icon name="truck" /><span><strong>Fast Delivery</strong><small>On Time</small></span></li>
            <li><Icon name="check" /><span><strong>Affordable Price</strong><small>Best Value</small></span></li>
          </ul>

          <section id="ice-products">
            <h2>Our Ice Products</h2>
            <p className="wm-ice-intro">High-quality ice products for all occasions.</p>
            {error && products.length === 0 ? <p className="wm-error">{error}</p> : null}
            {products.length === 0 ? (
              <div className="wm-ice-grid">
                {[
                  ['Ice Cubes (Regular)', 'Clear & Solid Ice'],
                  ['Crushed Ice', 'Perfect for Drinks'],
                  ['Ice Blocks', 'For Bulk Use'],
                ].map(([title, note]) => (
                  <article key={title} className="wm-ice-card">
                    <div className="wm-ice-card-photo"><span className="wm-icebag" /></div>
                    <h3>{title}</h3>
                    <small>{note}</small>
                    <a className="wm-btn wm-btn-navy" href="#ice-order">Order Now <span aria-hidden>→</span></a>
                  </article>
                ))}
              </div>
            ) : (
              <div className="wm-ice-grid">
                {products.map((product) => {
                  const src = publicWrsAssetUrl(supabase, product.image_url);
                  const count = qty[product.id] ?? 0;
                  const out = product.stock_quantity != null && product.stock_quantity <= 0;
                  return (
                    <article key={product.id} className={`wm-ice-card${activeId === product.id ? ' is-picked' : ''}`}>
                      <div className="wm-ice-card-photo">{src ? <img src={src} alt="" /> : <span className="wm-icebag" />}</div>
                      <h3>{product.name}</h3>
                      <small>{money(Number(product.price))}{out ? ' · Out of stock' : ''}</small>
                      <button type="button" className="wm-btn wm-btn-navy" disabled={out} onClick={() => orderProduct(product.id)}>
                        {count > 0 ? `Order Now · ${count}` : 'Order Now'} <span aria-hidden>→</span>
                      </button>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        <form id="ice-order" className="wm-ice-book" onSubmit={(event) => void submit(event)}>
          <h2><Icon name="calendar" /> Book Your Ice Delivery</h2>
          <p>Get your ice delivered right to your door.</p>
          {orderId ? (
            <p className="wm-done">Order received. The station can see it in Ice Order Management.</p>
          ) : (
            <>
              <div className="wm-ice-when">
                <BookingDate value={date} onChange={setDate} />
                <label>
                  Select Time
                  <input type="time" value={time} onChange={(event) => setTime(event.target.value)} required />
                </label>
              </div>
              <label>
                Full Name
                <input value={name} onChange={(event) => setName(event.target.value)} required />
              </label>
              <label>
                Contact Number
                <input value={phone} onChange={(event) => setPhone(event.target.value)} required />
              </label>
              <label>
                Delivery Address
                <input value={address} onChange={(event) => setAddress(event.target.value)} required />
              </label>
              <div className="wm-ice-qty">
                <div className="wm-stepper">
                  <button type="button" aria-label="Decrease quantity" disabled={!active} onClick={() => changeActiveQty(activeQty - 1)}>−</button>
                  <span>{active ? activeQty : 1}</span>
                  <button type="button" aria-label="Increase quantity" disabled={!active || (active.stock_quantity != null && activeQty >= active.stock_quantity)} onClick={() => changeActiveQty(activeQty + 1)}>+</button>
                </div>
                <span>{active ? active.name : 'Bag(s) / Block(s)'}</span>
              </div>
              {products.length === 0 ? <p className="wm-empty">Choose an ice product once the station adds it to inventory.</p> : null}
              {error && products.length > 0 ? <p className="wm-error">{error}</p> : null}
              <button className="wm-btn wm-btn-block" type="submit" disabled={busy || chosen.length === 0}>
                <Icon name="truck" /> {busy ? 'Sending…' : 'Confirm Booking'}
              </button>
              <p className="wm-ice-or">or</p>
              <button className="wm-btn wm-btn-line wm-btn-block" type="submit" disabled={busy || chosen.length === 0}>
                <Icon name="ice" /> Order Online
              </button>
              <p className="wm-ice-secure">Secure & Easy Ordering</p>
            </>
          )}
        </form>
      </div>
    </main>
  );
}

type LaundryService = { id: string; name: string; price: number; unit_label: string };

const LAUNDRY_SAMPLES = [
  { name: 'Wash & Fold', note: 'Clean, fresh and neatly folded.', price: 50, unit: 'kg', tone: 'fold' },
  { name: 'Wash & Iron', note: 'Freshly washed and pressed.', price: 70, unit: 'kg', tone: 'hang' },
  { name: 'Blanket & Comforter', note: 'Deep clean for your bedding.', price: 150, unit: 'pc', tone: 'blanket' },
  { name: 'Curtain Cleaning', note: 'Keep your home fresh.', price: 100, unit: 'pc', tone: 'curtain' },
];

function laundryPrice(price: number, unit: string) {
  const clean = unit.replace(/^per\s+/i, '');
  const amount = Number.isInteger(price) ? `₱${price}` : money(price);
  return `${amount} / ${clean}`;
}

export function LaundryPublicPage() {
  const [services, setServices] = useState<LaundryService[]>([]);
  const [serviceId, setServiceId] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [qty, setQty] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void supabase
      .from('laundry_services')
      .select('id,name,price,unit_label')
      .eq('is_available', true)
      .order('sort_order')
      .then(({ data, error: err }) => {
        if (err) setError(friendly(err.message));
        setServices((data ?? []) as LaundryService[]);
      });
  }, []);

  const selected = services.find((service) => service.id === serviceId) ?? null;

  function pick(id: string) {
    setServiceId(id);
    setQty((current) => Math.max(1, current));
    document.getElementById('laundry-order')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!serviceId) {
      setError('Select a service.');
      return;
    }
    const scheduled = new Date(`${date}T${time}`);
    if (Number.isNaN(scheduled.getTime())) {
      setError('Choose a date and time.');
      return;
    }
    setBusy(true);
    setError(null);
    const { data, error: err } = await supabase.rpc('create_public_laundry_booking', {
      p_customer_name: name,
      p_contact_number: phone,
      p_address: address,
      p_scheduled_for: scheduled.toISOString(),
      p_notes: '',
      p_items: [{ service_id: serviceId, quantity: qty }],
    });
    setBusy(false);
    if (err) {
      setError(friendly(err.message) ?? 'Laundry booking is not open yet. The station still needs the database update.');
      return;
    }
    setBookingId((data as { booking_id?: string } | null)?.booking_id ?? 'saved');
  }

  return (
    <main className="wm-ice">
      <div className="wm-ice-layout">
        <div className="wm-ice-main">
          <section className="wm-ice-hero">
            <div className="wm-ice-copy">
              <p className="wm-ice-badge">
                <Icon name="shirt" /> Professional Laundry Service
              </p>
              <h1>Laundry Service</h1>
              <p className="wm-ice-sub">Clean Clothes, Fresh Life!</p>
              <p className="wm-lead">Wash · Dry · Fold · Delivered</p>
              <div className="wm-ice-actions">
                <a className="wm-btn" href="#laundry-order">
                  <Icon name="calendar" /> Book Now <span aria-hidden>→</span>
                </a>
                <a className="wm-btn wm-btn-line" href="#laundry-services">
                  <Icon name="shirt" /> Order Laundry <span aria-hidden>→</span>
                </a>
              </div>
            </div>
            <div className="wm-ly-art" aria-hidden>
              <p className="wm-ice-script">Freshness in Every Wash!</p>
              <span className="wm-ly-basket" />
              <span className="wm-ly-towel wm-ly-towel-a" />
              <span className="wm-ly-towel wm-ly-towel-b" />
              <span className="wm-ly-towel wm-ly-towel-c" />
              <span className="wm-ly-machine" />
            </div>
          </section>

          <ul className="wm-ice-perks">
            <li><TrustIcon name="shield" /><span><strong>Clean & Hygienic</strong></span></li>
            <li><Icon name="calendar" /><span><strong>On-Time Delivery</strong></span></li>
            <li><TrustIcon name="thumb" /><span><strong>Affordable Rates</strong></span></li>
            <li><Icon name="check" /><span><strong>Eco-Friendly Wash</strong></span></li>
          </ul>

          <section id="laundry-services">
            <h2><span className="wm-kicker">—</span> Our Laundry Services</h2>
            <p className="wm-ice-intro">Quality care for your clothes, always.</p>
            {services.length === 0 ? (
              <div className="wm-ly-grid">
                {LAUNDRY_SAMPLES.map((item) => (
                  <article key={item.name} className="wm-ice-card">
                    <div className={`wm-ly-photo wm-ly-${item.tone}`} />
                    <h3>{item.name}</h3>
                    <small>{item.note}</small>
                    <span className="wm-ly-price">{laundryPrice(item.price, item.unit)}</span>
                  </article>
                ))}
              </div>
            ) : (
              <div className="wm-ly-grid">
                {services.map((service) => (
                  <button
                    key={service.id}
                    type="button"
                    className={`wm-ice-card wm-ly-pick${serviceId === service.id ? ' is-picked' : ''}`}
                    onClick={() => pick(service.id)}
                  >
                    <div className="wm-ly-photo wm-ly-fold" />
                    <h3>{service.name}</h3>
                    <small>{service.unit_label}</small>
                    <span className="wm-ly-price">{laundryPrice(Number(service.price), service.unit_label)}</span>
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>

        <form id="laundry-order" className="wm-ice-book" onSubmit={(event) => void submit(event)}>
          <h2><Icon name="calendar" /> Book Your Laundry Service</h2>
          <p>Schedule a pickup or delivery at your convenience.</p>
          {bookingId ? (
            <p className="wm-done">Booking received. Laundry Management can see it now.</p>
          ) : (
            <>
              <div className="wm-ice-when">
                <BookingDate value={date} onChange={setDate} />
                <label>
                  Select Time
                  <input type="time" value={time} onChange={(event) => setTime(event.target.value)} required />
                </label>
              </div>
              <label>
                Pickup Address
                <input value={address} onChange={(event) => setAddress(event.target.value)} required />
              </label>
              <label>
                Full Name
                <input value={name} onChange={(event) => setName(event.target.value)} required />
              </label>
              <label>
                Contact Number
                <input value={phone} onChange={(event) => setPhone(event.target.value)} required />
              </label>
              <label>
                Select Service
                <select value={serviceId} onChange={(event) => setServiceId(event.target.value)} required disabled={services.length === 0}>
                  <option value="">{services.length === 0 ? 'Add services in Laundry Management' : 'Choose service'}</option>
                  {services.map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.name} · {laundryPrice(Number(service.price), service.unit_label)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="wm-ice-qty">
                <div className="wm-stepper">
                  <button type="button" aria-label="Decrease quantity" onClick={() => setQty((current) => Math.max(1, current - 1))}>−</button>
                  <span>{qty}</span>
                  <button type="button" aria-label="Increase quantity" onClick={() => setQty((current) => Math.min(50, current + 1))}>+</button>
                </div>
                <span>({selected ? selected.unit_label.replace(/^per\s+/i, '') : 'kg / pc'})</span>
              </div>
              {error ? <p className="wm-error">{error}</p> : null}
              <button className="wm-btn wm-btn-block" type="submit" disabled={busy || services.length === 0}>
                <Icon name="truck" /> {busy ? 'Sending…' : 'Confirm Booking'}
              </button>
              <p className="wm-ice-or">or</p>
              <button className="wm-btn wm-btn-line wm-btn-block" type="submit" disabled={busy || services.length === 0}>
                <Icon name="shirt" /> Order Now
              </button>
            </>
          )}
        </form>
      </div>
    </main>
  );
}
