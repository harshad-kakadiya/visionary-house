/**
 * Types for Strapi API responses.
 * Match your Strapi content-types (global, homepage, service, booking, etc.).
 */

export interface StrapiMedia {
  id: number;
  url: string;
  alternativeText?: string | null;
  caption?: string | null;
  width?: number;
  height?: number;
  formats?: Record<string, { url: string }>;
}

export interface StrapiSingleResponse<T> {
  data: T;
  meta?: { meta?: Record<string, unknown> };
}

export interface StrapiCollectionResponse<T> {
  data: T[];
  meta?: { pagination?: { page: number; pageSize: number; pageCount: number; total: number } };
}

// ---- Global (single type) ----
export interface GlobalAttr {
  siteName?: string | null;
  tagline?: string | null;
  logo?: { data: StrapiMedia | null };
  defaultMetaTitle?: string | null;
  defaultMetaDescription?: string | null;
  ogImage?: { data: StrapiMedia | null };
  footerTagline?: string | null;
  copyrightText?: string | null;
  socialLinks?: Array<{ platform: string; url: string }>;
}

// ---- Homepage (single type) ----
export interface HeroSlide {
  title?: string | null;
  highlight?: string | null;
  subtitle?: string | null;
  description?: string | null;
  heading?: string | null;
  image?: { data: StrapiMedia | null } | StrapiMedia | null;
  bgImage?: { data: StrapiMedia | null } | StrapiMedia | null;
}

/** Strapi v5: heroSection (bgImage); homeService (serviceImage) */
export interface HomeServiceItem {
  id?: number;
  serviceTitle?: string | null;
  serviceDescription?: string | null;
  serviceImage?: { data: StrapiMedia | null } | StrapiMedia | null;
}

/** Strapi v5: homeWhyChooseFeature (feature); v4: differentiators (text) */
export interface WhyChooseFeatureItem {
  id?: number;
  feature?: string | null;
  text?: string | null;
}

export interface HomepageAttr {
  heroSlides?: HeroSlide[];
  heroSection?: HeroSlide[];
  servicesEyebrow?: string | null;
  servicesTitle?: string | null;
  servicesDescription?: string | null;
  differentiators?: Array<{ text?: string | null }>;
  homeService?: HomeServiceItem[];
  homeWhyChooseFeature?: WhyChooseFeatureItem[];
  testimonialsEyebrow?: string | null;
  testimonialsTitle?: string | null;
  faqEyebrow?: string | null;
  faqTitle?: string | null;
  faqDescription?: string | null;
  whyChooseUsEyebrow?: string | null;
  whyChooseUsTitle?: string | null;
  whyChooseUsBody?: string | null;
  whyChooseUsImage?: { data: StrapiMedia | null } | StrapiMedia | null;
  whyChooseUsStatNumber?: string | null;
  whyChooseUsStatLabel?: string | null;
  ctaTitle?: string | null;
  ctaDescription?: string | null;
  ctaPrimaryLabel?: string | null;
  ctaPrimaryHref?: string | null;
  ctaSecondaryLabel?: string | null;
  ctaSecondaryHref?: string | null;
  serviceCta?: string | null;
  serviceCtaHref?: string | null;
}

// ---- About Page (single type) ----
export interface AboutStatItem {
  id?: number;
  statsValue?: string | null;
  statsLabel?: string | null;
}

export interface AboutValueItem {
  id?: number;
  valueTitle?: string | null;
  ValueDescription?: string | null;
}

export interface AboutPageAttr {
  heroEyebrow?: string | null;
  heroTitle?: string | null;
  heroDescription?: string | null;
  heroImage?: { data: StrapiMedia | null } | StrapiMedia | null;
  storyEyebrow?: string | null;
  storyTitle?: string | null;
  storyParagraph?: Array<{ id?: number; storyParagraph?: string | null; body?: string | null; text?: string | null }>;
  storyCta?: string | null;
  storyCtaHref?: string | null;
  storyImage?: { data: StrapiMedia | null } | StrapiMedia | null;
  valuesEyebrow?: string | null;
  valuesTitle?: string | null;
  valuesDescription?: string | null;
  missionEyebrow?: string | null;
  missionQuote?: string | null;
  ctaTitle?: string | null;
  ctaDescription?: string | null;
  ctaPrimaryLabel?: string | null;
  ctaPrimaryHref?: string | null;
  ctaSecondaryLabel?: string | null;
  ctaSecondaryHref?: string | null;
  AboutStats?: AboutStatItem[];
  aboutValues?: AboutValueItem[];
}

// ---- Service Page (single type) ----
export interface ServicePageComponentItem {
  id?: number;
  serviceId?: string | null;
  subtitle?: string | null;
  title?: string | null;
  description?: string | null;
  image?: { data: StrapiMedia | null } | StrapiMedia | null;
  feature?: Array<{ id?: number; text?: string | null; feature?: string | null }>;
}

export interface ServicePageAttr {
  heroEyebrow?: string | null;
  heroTitle?: string | null;
  heroDescription?: string | null;
  heroImage?: { data: StrapiMedia | null } | StrapiMedia | null;
  serviceComponent?: ServicePageComponentItem[];
  ctaTitle?: string | null;
  ctaDescription?: string | null;
  ctaPrimaryLabel?: string | null;
  ctaPrimaryHref?: string | null;
  ctaSecondaryLabel?: string | null;
  ctaSecondaryHref?: string | null;
}

// ---- Service (collection) ----
export interface ServiceAttr {
  slug?: string | null;
  name?: string | null;
  subtitle?: string | null;
  description?: string | null;
  image?: { data: StrapiMedia | null };
  features?: Array<{ text: string }>;
  anchor?: string | null;
  sortOrder?: number | null;
  pricePerHour?: number | null;
  iconName?: string | null;
}

export interface StrapiService {
  id: number;
  documentId: string;
  attributes: ServiceAttr & { createdAt?: string; updatedAt?: string; publishedAt?: string | null };
}

// ---- Room / Space (collection) ----
export interface RoomSpaceAttr {
  title?: string | null;
  slug?: string | null;
  capacity?: number | null;
  rate?: number | null;
  pricingType?: string | null;
  image?: StrapiMedia | { data: StrapiMedia | null } | null;
  sortOrder?: number | null;
}

export interface StrapiRoomSpace {
  id: number;
  documentId: string;
  attributes?: RoomSpaceAttr & { createdAt?: string; updatedAt?: string; publishedAt?: string | null };
  /** Strapi v5 flat response: fields at top level */
  title?: string | null;
  slug?: string | null;
  capacity?: number | null;
  rate?: number | null;
  pricingType?: string | null;
  image?: StrapiMedia | { data: StrapiMedia | null } | null;
  sortOrder?: number | null;
}

// ---- Service Layout (collection) ----
export interface ServiceLayoutAttr {
  name?: string | null;
  capacity?: number | null;
  description?: string | null;
  image?: StrapiMedia | { data: StrapiMedia | null } | null;
  sortOrder?: number | null;
  roomSpace?: { data: StrapiRoomSpace | null } | null;
  service?: { data: StrapiService | null };
}

export interface StrapiServiceLayout {
  id: number;
  documentId: string;
  attributes: ServiceLayoutAttr & { createdAt?: string; updatedAt?: string; publishedAt?: string | null };
}

// ---- Add-on (collection) ----
export interface AddOnAttr {
  name?: string | null;
  description?: string | null;
  price?: number | null;
  category?: string | null;
  subcategory?: string | null;
  image?: StrapiMedia | { data: StrapiMedia | null } | null;
  mainCategory?: string | null;
  sortOrder?: number | null;
}

export interface StrapiAddOn {
  id: number;
  documentId: string;
  attributes: AddOnAttr & { createdAt?: string; updatedAt?: string; publishedAt?: string | null };
}

// ---- Event Type (collection) ----
export interface EventTypeAttr {
  label?: string | null;
  isMultiDay?: boolean;
  sortOrder?: number | null;
  service?: { data: StrapiService | null };
}

export interface StrapiEventType {
  id: number;
  documentId: string;
  attributes: EventTypeAttr & { createdAt?: string; updatedAt?: string; publishedAt?: string | null };
}

// ---- Guest Type (collection) ----
export interface GuestTypeAttr {
  guestType?: string | null;
}

export interface StrapiGuestType {
  id: number;
  documentId: string;
  attributes: GuestTypeAttr & { createdAt?: string; updatedAt?: string; publishedAt?: string | null };
}

// ---- Testimonial (collection) ----
export interface TestimonialAttr {
  quote?: string | null;
  author?: string | null;
  title?: string | null;
  sortOrder?: number | null;
}

export interface StrapiTestimonial {
  id: number;
  documentId: string;
  attributes: TestimonialAttr & { createdAt?: string; updatedAt?: string; publishedAt?: string | null };
}

// ---- FAQ (collection) ----
export interface FaqAttr {
  question?: string | null;
  answer?: string | null;
  sortOrder?: number | null;
}

/** Supports both Strapi v4 (attributes) and v5 (flat) REST response shapes */
export interface StrapiFaq {
  id?: number;
  documentId?: string;
  attributes?: FaqAttr & { createdAt?: string; updatedAt?: string; publishedAt?: string | null };
  /** Strapi v5 flat fields */
  question?: string | null;
  answer?: string | null;
  sortOrder?: number | null;
}

// ---- Nav Link (collection) ----
export interface NavLinkAttr {
  label?: string | null;
  href?: string | null;
  sortOrder?: number | null;
  openInNewTab?: boolean;
}

export interface StrapiNavLink {
  id: number;
  documentId: string;
  attributes: NavLinkAttr & { createdAt?: string; updatedAt?: string; publishedAt?: string | null };
}

// ---- Contact Page (single type) ----
// API: heroEyebrow, heroTitle, heroDescription, heroBackgroundImage; address, contactPhoneNo, contactEmail, bussinessHours; whatsappTitle, whatsappDescription, whatsappNumber, whatsappCtaLabel; mapEmbedUrl; ctaTitle, ctaDescription, ctaButtonLabel, ctaButtonHref
export interface ContactPageAttr {
  heroEyebrow?: string | null;
  heroTitle?: string | null;
  heroDescription?: string | null;
  heroBackgroundImage?: { data: StrapiMedia | null } | StrapiMedia | null;
  address?: string | null;
  contactPhoneNo?: string | null;
  contactEmail?: string | null;
  bussinessHours?: string | null;
  whatsappTitle?: string | null;
  whatsappDescription?: string | null;
  whatsappNumber?: string | null;
  whatsappCtaLabel?: string | null;
  mapEmbedUrl?: string | null;
  ctaTitle?: string | null;
  ctaDescription?: string | null;
  ctaButtonLabel?: string | null;
  ctaButtonHref?: string | null;
}

// ---- Policies Page (single type) ----
// API: heroEyebrow, heroTitle, heroDescription, heroBackgroundImage; policies[] (policyId, title, content[] { heading, description }); ctaTitle, ctaDescription, ctaDescriptionHighlight, lastUpdated
export interface PoliciesPageContentItem {
  id?: number;
  heading?: string | null;
  description?: string | null;
}

export interface PoliciesPagePolicyItem {
  id?: number;
  policyId?: string | null;
  title?: string | null;
  content?: PoliciesPageContentItem[];
}

export interface PoliciesPageAttr {
  heroEyebrow?: string | null;
  heroTitle?: string | null;
  heroDescription?: string | null;
  heroBackgroundImage?: { data: StrapiMedia | null } | StrapiMedia | null;
  policies?: PoliciesPagePolicyItem[];
  ctaTitle?: string | null;
  ctaDescription?: string | null;
  ctaDescriptionHighlight?: string | null;
  lastUpdated?: string | null;
}

// ---- Gallery Page (single type) ----
// API returns flat: heroEyebrow, heroTitle, heroDescription, heroImage (direct media), image[] (each: id, description, category, image as direct media)
export interface GalleryPageImageItem {
  id?: number;
  description?: string | null;
  title?: string | null;
  image?: { data: StrapiMedia | null } | StrapiMedia | null;
  category?: string | null;
}

export interface GalleryPageAttr {
  heroEyebrow?: string | null;
  heroTitle?: string | null;
  heroDescription?: string | null;
  heroImage?: { data: StrapiMedia | null } | StrapiMedia | null;
  image?: GalleryPageImageItem[];
}

// ---- Gallery Category & Item ----
export interface GalleryCategoryAttr {
  name?: string | null;
  slug?: string | null;
  sortOrder?: number | null;
}

export interface StrapiGalleryCategory {
  id: number;
  documentId: string;
  attributes: GalleryCategoryAttr & { createdAt?: string; updatedAt?: string; publishedAt?: string | null };
}

export interface GalleryItemAttr {
  alt?: string | null;
  sortOrder?: number | null;
  image?: { data: StrapiMedia | null };
  category?: { data: StrapiGalleryCategory | null };
}

export interface StrapiGalleryItem {
  id: number;
  documentId: string;
  attributes: GalleryItemAttr & { createdAt?: string; updatedAt?: string; publishedAt?: string | null };
}

// ---- Booking (collection) ----
export type BookingStatus = "Pending" | "Confirm" | "Cancelled" | "Partial Payment" | "Pay Later";

export interface BookingAttr {
  referenceNumber?: string | null;
  customerName?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  companyName?: string | null;
  eventType?: string | null;
  date?: string | null;
  endDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  attendees?: number | null;
  layout?: { data: StrapiServiceLayout | null };
  message?: string | null;
  status?: BookingStatus | null;
  totalPrice?: number | null;
  currency?: string | null;
  service?: { data: StrapiService | null };
  addOns?: { data: StrapiAddOn[] };
}

export interface StrapiBooking {
  id: number;
  documentId: string;
  attributes: BookingAttr & { createdAt?: string; updatedAt?: string; publishedAt?: string | null };
}

// ---- Book (from) Page (single type) ----
// API: heroEyebrow, heroTitle, heroDescription, heroImage; feature[] (title, description)
export interface BookPageFeatureItem {
  id?: number;
  title?: string | null;
  description?: string | null;
}

export interface BookPageAttr {
  heroEyebrow?: string | null;
  heroTitle?: string | null;
  heroDescription?: string | null;
  heroImage?: { data: StrapiMedia | null } | StrapiMedia | null;
  feature?: BookPageFeatureItem[];
  helpCard?:any;
}

// ---- Booking Settings (single type) ----
// Includes config (buffer, duration, hours) and page content (hero, CTA, find-booking section)
export interface BookingSettingsAttr {
  bufferMinutes?: number | null;
  minBookingDuration?: number | null;
  maxBookingDuration?: number | null;
  advanceBookingDays?: number | null;
  businessHoursStart?: string | null;
  businessHoursEnd?: string | null;
  blockedDates?: string | null; // JSON array
  bookingReferencePrefix?: string | null;
  heroEyebrow?: string | null;
  heroTitle?: string | null;
  heroDescription?: string | null;
  heroImage?: { data: StrapiMedia | null } | StrapiMedia | null;
  ctaTitle?: string | null;
  ctaDescription?: string | null;
  ctaPrimaryLabel?: string | null;
  ctaPrimaryHref?: string | null;
  ctaSecondaryLabel?: string | null;
  ctaSecondaryHref?: string | null;
  findBookingSectionTitle?: string | null;
  findBookingSectionDescription?: string | null;
  bookingRefLabel?: string | null;
  bookingRefPlaceholder?: string | null;
  emailLabel?: string | null;
  emailPlaceholder?: string | null;
}

// ---- Configs (single type) ----
export interface ConfigsAttr {
  maintenance_mode?: boolean | null;
  adminEmail?: string | null;
}

// Helpers: get media URL from Strapi response
export function getMediaUrl(media: { data: StrapiMedia | null } | undefined, strapiBaseUrl?: string): string {
  if (!media?.data?.url) return "";
  const url = media.data.url;
  if (url.startsWith("http")) return url;
  const base = (strapiBaseUrl || process.env.NEXT_PUBLIC_STRAPI_URL || "").replace(/\/$/, "");
  return base ? `${base}${url}` : url;
}
