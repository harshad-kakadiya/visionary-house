/**
 * Map Strapi API responses to the shapes expected by the frontend.
 * Uses getMediaUrl for image URLs when Strapi base URL is needed.
 */

import { getMediaUrl, type StrapiMedia } from "./types";
import type { HomepageAttr, AboutPageAttr, ServicePageAttr, GalleryPageAttr, ContactPageAttr, BookingSettingsAttr, BookPageAttr, PoliciesPageAttr, StrapiService, StrapiTestimonial, StrapiFaq, StrapiAddOn, StrapiEventType, StrapiServiceLayout, StrapiRoomSpace, StrapiGuestType } from "./types";
import type { BookingAddOn, ServiceLayout } from "@/lib/types/booking";

const STRAPI_BASE = process.env.NEXT_PUBLIC_STRAPI_URL || "";

function getImageUrl(media: { data?: StrapiMedia | null } | StrapiMedia | null | undefined, fallback: string): string {
  if (!media) return fallback;
  const url = "url" in media && typeof media.url === "string" ? media.url : getMediaUrl(media as { data: StrapiMedia | null }, STRAPI_BASE);
  if (url.startsWith("http")) return url;
  const base = STRAPI_BASE.replace(/\/$/, "");
  return url ? (base ? `${base}${url}` : url) : fallback;
}

export interface MappedHeroSlide {
  title: string;
  highlight: string;
  subtitle: string;
  description: string;
  heading: string;
  image: string;
}

const HERO_FALLBACK_IMAGES = ["/assets/1.jpg", "/assets/2.jpg", "/assets/3.jpg"];

export function mapHomepageHeroSlides(attr: HomepageAttr | null): MappedHeroSlide[] | null {
  const slides = attr?.heroSection?.length ? attr.heroSection : attr?.heroSlides?.length ? attr.heroSlides : null;
  if (!slides?.length) return null;
  return slides.map((s, i) => {
    const slideWithBg = s as { image?: { data?: StrapiMedia | null } | StrapiMedia | null; bgImage?: { data?: StrapiMedia | null } | StrapiMedia | null; heading?: string | null };
    const media = slideWithBg.bgImage ?? slideWithBg.image;
    return {
      title: s.title ?? "",
      highlight: s.highlight ?? "",
      subtitle: s.subtitle ?? "",
      description: s.description ?? "",
      heading: slideWithBg.heading ?? "Welcome to Visionary House",
      image: getImageUrl(media, HERO_FALLBACK_IMAGES[i] ?? "/assets/1.jpg"),
    };
  });
}

export interface MappedServicePreview {
  title: string;
  description: string;
  icon: string;
  image: string;
  href: string;
}

const ICON_NAMES = ["Building2", "Users", "Briefcase", "Video"] as const;
const HOME_SERVICE_DEFAULTS: MappedServicePreview[] = [
  { title: "Event Space", description: "Sophisticated venues for conferences, board meetings, and corporate gatherings.", icon: "Building2", image: "/assets/4.jpg", href: "/services#event-space" },
  { title: "Lounge Suite", description: "Premium relaxation spaces designed for professional comfort and private conversations.", icon: "Users", image: "/assets/5.jpg", href: "/services#lounge" },
  { title: "Virtual Offices", description: "Professional business presence with mail handling, call answering, and registered addresses.", icon: "Briefcase", image: "/assets/6.jpg", href: "/services#virtual-offices" },
  { title: "Media Services", description: "State-of-the-art studios for podcasts, video production, and professional content creation.", icon: "Video", image: "/assets/q1.jpg", href: "/services#media" },
];

export function mapServicesPreview(services: StrapiService[] | null): MappedServicePreview[] | null {
  if (!services?.length) return null;
  return services.slice(0, 4).map((s, i) => {
    const att = s.attributes;
    const anchor = att.anchor || att.slug || "";
    const href = anchor ? `/services#${anchor}` : (HOME_SERVICE_DEFAULTS[i]?.href ?? "/services");
    return {
      title: att.name ?? HOME_SERVICE_DEFAULTS[i]?.title ?? "",
      description: att.description ?? HOME_SERVICE_DEFAULTS[i]?.description ?? "",
      icon: att.iconName && ICON_NAMES.includes(att.iconName as (typeof ICON_NAMES)[number]) ? att.iconName : HOME_SERVICE_DEFAULTS[i]?.icon ?? "Building2",
      image: (getMediaUrl(att.image, STRAPI_BASE) || HOME_SERVICE_DEFAULTS[i]?.image) ?? "",
      href,
    };
  });
}

/** Map homepage homeService (Strapi v5) to services preview; uses serviceImage from API, index-based defaults for icon and href */
export function mapHomepageServicesPreview(attr: HomepageAttr | null): MappedServicePreview[] | null {
  const list = attr?.homeService?.length ? attr.homeService : null;
  if (!list?.length) return null;
  return list.slice(0, 4).map((item, i) => ({
    title: item.serviceTitle ?? HOME_SERVICE_DEFAULTS[i]?.title ?? "",
    description: item.serviceDescription ?? HOME_SERVICE_DEFAULTS[i]?.description ?? "",
    icon: HOME_SERVICE_DEFAULTS[i]?.icon ?? "Building2",
    image: getImageUrl(item.serviceImage as { data?: StrapiMedia | null } | StrapiMedia | null, HOME_SERVICE_DEFAULTS[i]?.image ?? "/assets/4.jpg"),
    href: HOME_SERVICE_DEFAULTS[i]?.href ?? "/services",
  }));
}

export function mapDifferentiators(attr: HomepageAttr | null): string[] | null {
  const fromFeatures = attr?.homeWhyChooseFeature?.length
    ? attr.homeWhyChooseFeature.map((d) => d.feature ?? "").filter(Boolean)
    : null;
  if (fromFeatures?.length) return fromFeatures;
  if (!attr?.differentiators?.length) return null;
  return attr.differentiators.map((d) => (d as { text?: string }).text ?? "").filter(Boolean);
}

export function getWhyChooseUsImageUrl(attr: HomepageAttr | null): string {
  const media = attr?.whyChooseUsImage;
  if (!media) return "/assets/q2.jpg";
  return getImageUrl(media as { data?: StrapiMedia | null } | StrapiMedia, "/assets/q2.jpg");
}

// ---- About page ----
export function getAboutHeroImageUrl(attr: AboutPageAttr | null): string {
  const media = attr?.heroImage;
  if (!media) return "/assets/6.jpg";
  return getImageUrl(media as { data?: StrapiMedia | null } | StrapiMedia, "/assets/6.jpg");
}

export function getAboutStoryImageUrl(attr: AboutPageAttr | null): string {
  const media = attr?.storyImage;
  if (!media) return "/assets/q3.jpg";
  return getImageUrl(media as { data?: StrapiMedia | null } | StrapiMedia, "/assets/q3.jpg");
}

export function mapAboutStoryParagraphs(attr: AboutPageAttr | null): string[] {
  const list = attr?.storyParagraph;
  if (!list?.length) return [];
  return list.map((p) => (p.storyParagraph ?? p.body ?? p.text ?? "").trim()).filter(Boolean);
}

export interface MappedAboutStat {
  value: string;
  label: string;
}

export function mapAboutStats(attr: AboutPageAttr | null): MappedAboutStat[] {
  const list = attr?.AboutStats;
  if (!list?.length) return [];
  return list.map((s) => ({ value: s.statsValue ?? "", label: s.statsLabel ?? "" })).filter((s) => s.value || s.label);
}

export interface MappedAboutValue {
  title: string;
  description: string;
  icon: "Award" | "Shield" | "Users" | "Clock";
}

const VALUES_ICONS: MappedAboutValue["icon"][] = ["Award", "Shield", "Users", "Clock"];

export function mapAboutValues(attr: AboutPageAttr | null): MappedAboutValue[] {
  const list = attr?.aboutValues;
  if (!list?.length) return [];
  return list.map((v, i) => ({
    title: v.valueTitle ?? "",
    description: v.ValueDescription ?? "",
    icon: VALUES_ICONS[i % VALUES_ICONS.length],
  }));
}

// ---- Service page ----
export function getServicePageHeroImageUrl(attr: ServicePageAttr | null): string {
  const media = attr?.heroImage;
  if (!media) return "/assets/q1.jpg";
  return getImageUrl(media as { data?: StrapiMedia | null } | StrapiMedia, "/assets/q1.jpg");
}

export interface MappedServicePageComponent {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  image: string;
  features: string[];
}

export function mapServicePageComponents(attr: ServicePageAttr | null): MappedServicePageComponent[] {
  const list = attr?.serviceComponent;
  if (!list?.length) return [];
  return list.map((c) => {
    const features = (c.feature ?? []).map((f) => (f.text ?? f.feature ?? "").trim()).filter(Boolean);
    return {
      id: c.serviceId ?? String(c.id ?? ""),
      title: c.title ?? "",
      subtitle: c.subtitle ?? "",
      description: c.description ?? "",
      image: getImageUrl(c.image as { data?: StrapiMedia | null } | StrapiMedia | null, "/assets/1.jpg"),
      features,
    };
  });
}

// ---- Contact page ----
export function getContactPageHeroImageUrl(attr: ContactPageAttr | null): string {
  const media = attr?.heroBackgroundImage;
  if (!media) return "/assets/5.jpg";
  return getImageUrl(media as { data?: StrapiMedia | null } | StrapiMedia, "/assets/5.jpg");
}

// ---- Policies page ----
export function getPoliciesPageHeroImageUrl(attr: PoliciesPageAttr | null): string {
  const media = attr?.heroBackgroundImage;
  if (!media) return "/assets/4.jpg";
  return getImageUrl(media as { data?: StrapiMedia | null } | StrapiMedia, "/assets/4.jpg");
}

export interface MappedPolicy {
  policyId: string;
  title: string;
  content: { heading: string; description: string }[];
}

export function mapPoliciesPagePolicies(attr: PoliciesPageAttr | null): MappedPolicy[] {
  const list = attr?.policies;
  if (!list?.length) return [];
  return list.map((p) => ({
    policyId: (p.policyId ?? String(p.id ?? "")).trim() || "policy",
    title: p.title ?? "",
    content: (p.content ?? []).map((c) => ({
      heading: c.heading ?? "",
      description: c.description ?? "",
    })),
  })).filter((p) => p.title || p.content.some((c) => c.heading || c.description));
}

// ---- Booking Settings page (hero + CTA) ----
export function getBookingSettingsHeroImageUrl(attr: BookingSettingsAttr | null): string {
  const media = attr?.heroImage;
  if (!media) return "/assets/3.jpg";
  return getImageUrl(media as { data?: StrapiMedia | null } | StrapiMedia, "/assets/3.jpg");
}

// ---- Book (from) page ----
export function getBookPageHeroImageUrl(attr: BookPageAttr | null): string {
  const media = attr?.heroImage;
  if (!media) return "/assets/4.jpg";
  return getImageUrl(media as { data?: StrapiMedia | null } | StrapiMedia, "/assets/4.jpg");
}

export interface MappedBookPageFeature {
  title: string;
  description: string;
}

export function mapBookPageFeatures(attr: BookPageAttr | null): MappedBookPageFeature[] {
  const raw = attr?.feature;
  const list = Array.isArray(raw) ? raw : raw != null ? [raw] : [];
  if (!list.length) return [];
  return list.map((item: { title?: string | null; description?: string | null }) => ({
    title: item.title ?? "",
    description: item.description ?? "",
  })).filter((item) => item.title || item.description);
}

// ---- Gallery page ----
export function getGalleryPageHeroImageUrl(attr: GalleryPageAttr | null): string {
  const media = attr?.heroImage;
  if (!media) return "/assets/2.jpg";
  return getImageUrl(media as { data?: StrapiMedia | null } | StrapiMedia, "/assets/2.jpg");
}

export interface MappedGalleryPageImage {
  src: string;
  alt: string;
  title: string;
  category: string;
}

export function mapGalleryPageImages(attr: GalleryPageAttr | null): MappedGalleryPageImage[] {
  const list = attr?.image;
  if (!list?.length) return [];
  return list.map((item) => {
    const caption = item.description ?? item.title ?? "";
    return {
      src: getImageUrl(item.image as { data?: StrapiMedia | null } | StrapiMedia | null, ""),
      alt: caption,
      title: caption,
      category: item.category ?? "All",
    };
  }).filter((item) => item.src);
}

export interface MappedTestimonial {
  quote: string;
  author: string;
  title: string;
}

export function mapTestimonials(list: StrapiTestimonial[] | null): MappedTestimonial[] | null {
  if (!list?.length) return null;
  return list.map((t) => {
    // Strapi v4: { id, attributes: { quote, author, title } }; Strapi v5: flat { quote, author, title }
    const att = t.attributes ?? t;
    const q = typeof att === "object" && att !== null ? (att as { quote?: string; author?: string; title?: string }) : {};
    return {
      quote: q.quote ?? "",
      author: q.author ?? "",
      title: q.title ?? "",
    };
  });
}

export interface MappedFaq {
  question: string;
  answer: string;
}

export function mapFaqs(list: StrapiFaq[] | null): MappedFaq[] | null {
  if (!list?.length) return null;
  return list.map((f) => ({
    question: f.question ?? f.attributes?.question ?? "",
    answer: f.answer ?? f.attributes?.answer ?? "",
  }));
}

// ---- Booking form: Add-on, Event Type, Service Layout, Guest Type ----
function getAttr<T extends { attributes?: any }>(item: T): NonNullable<T["attributes"]> | T {
  return (item as any).attributes ?? item;
}

function getDirectImageUrl(img: StrapiMedia | { data?: StrapiMedia | null } | null | undefined): string {
  if (!img) return "";
  // Strapi v5: image is directly the media object with url
  if (typeof img === "object" && "url" in img && typeof img.url === "string") {
    return img.url;
  }
  // Strapi v4: image is { data: { url } }
  return getImageUrl(img as { data?: StrapiMedia | null }, "");
}

export function mapStrapiAddOns(items: StrapiAddOn[]): BookingAddOn[] {
  if (!items?.length) return [];
  return items.map((item) => {
    const a: any = getAttr(item);
    const category = (a?.category as BookingAddOn["category"]) ?? "equipment";
    return {
      id: String(item.id ?? item.documentId ?? ""),
      name: a?.name ?? "",
      description: a?.description ?? "",
      price: Number(a?.price) || 0,
      category: ["catering", "equipment", "services"].includes(category) ? category : "equipment",
      subcategory: a?.subcategory as BookingAddOn["subcategory"] | undefined,
      img: getDirectImageUrl(a?.image as StrapiMedia | null),
    };
  });
}

export interface ServiceLayoutWithRoom extends ServiceLayout {
  roomSpace?: string;
  rate?: number;
  pricingType?: string;
}

export interface MappedEventType {
  id: string;
  label: string;
  serviceType: string;
  isMultiDay: boolean;
}

export function mapStrapiEventTypes(items: StrapiEventType[]): MappedEventType[] {
  if (!items?.length) return [];
  return items.map((item) => {
    const a: any = getAttr(item);
    // No service relation in API, default to event-space for all
    return {
      id: String(item.id ?? item.documentId ?? ""),
      label: a?.label ?? "",
      serviceType: "event-space",
      isMultiDay: Boolean(a?.isMultiDay),
    };
  });
}

// Map room-space slug to service key (event-space, lounge, etc.) for grouping layouts by service type
function roomSpaceSlugToServiceKey(slug: string | null | undefined): string {
  if (!slug) return "event-space";
  if (slug === "lounge") return "lounge";
  return "event-space";
}

export function mapStrapiServiceLayouts(items: StrapiServiceLayout[]): Record<string, ServiceLayoutWithRoom[]> {
  if (!items?.length) return {};
  const byService: Record<string, ServiceLayoutWithRoom[]> = {};
  for (const item of items) {
    const a: any = getAttr(item);
    const roomSpaceRel = (a as { roomSpace?: { data?: StrapiRoomSpace | null } | null }).roomSpace;
    const roomSpaceData = roomSpaceRel?.data ?? (roomSpaceRel as StrapiRoomSpace | null) ?? null;
    const slug =
      roomSpaceData?.attributes?.slug ??
      (roomSpaceData as { slug?: string } | null)?.slug ??
      null;
    const key = roomSpaceSlugToServiceKey(slug ?? undefined);
    const roomCapacity =
      roomSpaceData?.attributes?.capacity ??
      (roomSpaceData as { capacity?: number } | null)?.capacity ??
      null;
    const roomRate =
      roomSpaceData?.attributes?.rate ??
      (roomSpaceData as { rate?: number } | null)?.rate ??
      null;
    const roomPricingType =
      roomSpaceData?.attributes?.pricingType ??
      (roomSpaceData as { pricingType?: string } | null)?.pricingType ??
      null;

    if (!byService[key]) byService[key] = [];
    byService[key].push({
      id: String(item.id ?? item.documentId ?? ""),
      name: a?.name ?? "",
      capacity: roomCapacity != null ? Number(roomCapacity) || 0 : Number(a?.capacity) || 0,
      rate: roomRate != null ? Number(roomRate) || 0 : undefined,
      pricingType: typeof roomPricingType === "string" ? roomPricingType : undefined,
      description: a?.description ?? "",
      image: getDirectImageUrl(a?.image as StrapiMedia | null),
      roomSpace: slug ?? undefined,
    });
  }
  return byService;
}

export interface MappedRoomSpace {
  id: string;
  name: string;
  imageUrl?: string;
}

export function mapStrapiRoomSpaces(items: StrapiRoomSpace[]): MappedRoomSpace[] {
  if (!items?.length) return [];
  return items.map((item) => {
    const att = getAttr(item) as { slug?: string; title?: string; image?: StrapiMedia | { data?: StrapiMedia | null } | null };
    const slug = att?.slug ?? String((item as { documentId?: string; id?: number }).documentId ?? (item as { id?: number }).id ?? "");
    const title = att?.title ?? slug;
    const imageUrl = getDirectImageUrl(att?.image as StrapiMedia | null);
    return { id: slug, name: title, imageUrl: imageUrl || undefined };
  });
}

export function mapStrapiGuestTypes(items: StrapiGuestType[]): string[] {
  if (!items?.length) return [];
  return items
    .map((item) => {
      const a:any = getAttr(item);
      return a?.guestType ?? "";
    })
    .filter(Boolean);
}
