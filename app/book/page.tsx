"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Layout } from "@/components/layout/layout";
import { PageHero, PageHeroSkeleton } from "@/components/sections";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowRight,
  Calendar as CalendarIcon,
  Clock,
  Users,
  DollarSign,
  CheckCircle2,
  Info,
  MapPin,
  Search,
  Copy,
  Check,
  Loader2,
  ChevronDown
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import {
  serviceTypeNames,
  bookingAddOns,
  serviceLayouts,
  bookingConfig,
  eventTypes
} from "@/lib/data/booking-config";
import {
  calculateBookingPrice,
  formatTime,
  timeToMinutes,
  generateBookingReference,
  getTotalDurationMinutes,
  countShiftsInRange,
} from "@/lib/utils/booking-utils";
import { validateInternationalPhone, normalizeInternationalPhone } from "@/lib/utils/phone";
import type { BookingFormData, BookingAddOn, ServiceLayout } from "@/lib/types/booking";
import { fetchBookPage, fetchAddOns, fetchEventTypes, fetchServiceLayouts, fetchGuestTypes, fetchConfigs, isStrapiConfigured } from "@/lib/strapi";
import { getBookPageHeroImageUrl, mapBookPageFeatures, mapStrapiAddOns, mapStrapiEventTypes, mapStrapiServiceLayouts, mapStrapiGuestTypes } from "@/lib/strapi/mappers";
import coffee from '../../public/assets/coffee.jpg'

// Visionary House room matching (UI-only) — fallback when APIs not used
const GUEST_TYPES_FALLBACK = ["Government", "NGO", "Corporate"] as const;

const ROOM_SPACE_OPTIONS: { id: string; name: string }[] = [
  { id: "small-meeting-room", name: "Small Meeting Room" },
  { id: "lounge", name: "Lounge" },
  { id: "main-hall", name: "Main Hall" },
  { id: "combined-hall", name: "Combined Hall" },
];

// Strict space visibility by participant count (UI-only)
function getAvailableRoomSpaces(participantCount: number): { id: string; name: string }[] {
  if (participantCount >= 1 && participantCount <= 8) {
    return [ROOM_SPACE_OPTIONS.find((r) => r.id === "small-meeting-room")!];
  }
  if (participantCount >= 9 && participantCount <= 15) {
    return [ROOM_SPACE_OPTIONS.find((r) => r.id === "lounge")!];
  }
  if (participantCount >= 16 && participantCount <= 35) {
    return [ROOM_SPACE_OPTIONS.find((r) => r.id === "main-hall")!];
  }
  if (participantCount >= 36 && participantCount <= 50) {
    return [
      ROOM_SPACE_OPTIONS.find((r) => r.id === "main-hall")!,
      ROOM_SPACE_OPTIONS.find((r) => r.id === "combined-hall")!,
    ];
  }
  if (participantCount >= 51 && participantCount <= 70) {
    return [ROOM_SPACE_OPTIONS.find((r) => r.id === "combined-hall")!];
  }
  return [];
}

// Rule C1 — Capacity-based suggestion: which room space to suggest first
function getSuggestedRoomSpaceForParticipants(N: number): string | null {
  if (N <= 0 || !Number.isFinite(N)) return null;
  if (N <= 8) return "small-meeting-room";   // Suggest Small Meeting Room first
  if (N <= 15) return "lounge";               // Suggest Lounge first
  // N > 15: Layout required. Match Main Hall (Partition ON) or Combined Hall (Partition OFF) by max capacity
  if (N <= 50) return "main-hall";            // Main Hall max 50 (theatre)
  if (N <= 70) return "combined-hall";        // Combined Hall max 70 (theatre)
  return null;
}

// Fallback chain when suggested room is unavailable (price tier: small < lounge < main-hall < combined-hall)
function getRoomFallbackChain(suggestedRoom: string): string[] {
  if (suggestedRoom === "small-meeting-room") return ["lounge", "main-hall"];
  if (suggestedRoom === "lounge") return ["main-hall"];
  return [];
}

// Message when showing fallback room (higher price)
function getRoomFallbackMessage(
  suggestedRoom: string,
  effectiveRoom: string,
  roomsWithConflict: Set<string>,
  labels: Record<string, string>
): string | null {
  if (suggestedRoom === effectiveRoom) return null;
  const suggestedLabel = labels[suggestedRoom] ?? suggestedRoom;
  const effectiveLabel = labels[effectiveRoom] ?? effectiveRoom;
  if (suggestedRoom === "small-meeting-room" && effectiveRoom === "lounge") {
    return `${suggestedLabel} is not available for this selected date and time. You may book the ${effectiveLabel} instead; however, please note that the price will be higher.`;
  }
  if (suggestedRoom === "small-meeting-room" && effectiveRoom === "main-hall") {
    const loungeLabel = labels["lounge"] ?? "Lounge";
    return `${suggestedLabel} and ${loungeLabel} are not available for this selected date and time. Only the ${effectiveLabel} is available; please note that it comes with a higher price.`;
  }
  if (suggestedRoom === "lounge" && effectiveRoom === "main-hall") {
    return `${suggestedLabel} is not available for this selected date and time. You may book the ${effectiveLabel} instead; however, please note that the price will be higher.`;
  }
  return null;
}

// Layout capacity by hall (max people)
const HALL_LAYOUT_CAPACITIES: Record<string, Record<string, number>> = {
  "main-hall": { "u-shape": 35, meeting: 37, theatre: 50 },
  "combined-hall": { "u-shape": 45, meeting: 47, theatre: 70 },
};

// Layout options filtered by hall + participant count; hide options that cannot accommodate participants
function getAvailableLayoutsForHall(
  hallId: string,
  participantCount: number
): { id: string; name: string; capacity: number }[] {
  if (
    Number.isNaN(participantCount) ||
    participantCount < 1 ||
    participantCount > 70
  ) {
    return [];
  }
  const caps = HALL_LAYOUT_CAPACITIES[hallId];
  if (!caps) return [];
  const all = [
    { id: "u-shape" as const, name: "U-Shape", capacity: caps["u-shape"] ?? 0 },
    { id: "meeting" as const, name: "Meeting", capacity: caps.meeting ?? 0 },
    { id: "theatre" as const, name: "Theatre", capacity: caps.theatre ?? 0 },
  ];
  // Only return layouts that can accommodate the participant count
  if (hallId === "main-hall") {
    if (participantCount >= 36) return all.filter((e) => e.id === "theatre" && e.capacity >= participantCount);
    return all.filter((e) => e.capacity >= participantCount);
  }
  if (hallId === "combined-hall") {
    if (participantCount >= 46) return all.filter((e) => e.id === "theatre" && e.capacity >= participantCount);
    return all.filter((e) => e.capacity >= participantCount);
  }
  return [];
}

function getLayoutLabel(name: string, capacity: number): string {
  return `${name} – up to ${capacity} people`;
}

const ROOM_SPACE_LABELS: Record<string, string> = {
  "small-meeting-room": "Small Meeting Room",
  lounge: "Lounge",
  "main-hall": "Main Hall",
  "combined-hall": "Combined Hall",
};

const HALL_LAYOUT_LABELS: Record<string, string> = {
  "u-shape": "U-Shape",
  meeting: "Meeting",
  theatre: "Theatre",
};

// Image paths for hall layouts (used when showing layout modal for Main Hall / Combined Hall fallback)
const HALL_LAYOUT_IMAGES: Record<string, string> = {
  "u-shape": "/assets/5.jpg",
  meeting: "/assets/1.jpg",
  theatre: "/assets/2.jpg",
};

function getLayoutDisplayLabel(roomSpace: string, layoutId: string): string {
  const name = HALL_LAYOUT_LABELS[layoutId] ?? layoutId;
  const cap = HALL_LAYOUT_CAPACITIES[roomSpace]?.[layoutId];
  return cap != null ? `${name} – up to ${cap} people` : name;
}

// Map "Choose a Layout" popup layout names (serviceLayouts) to hall layout ids
// Boardroom / Meeting Setup → Meeting; Theatre Style → Theatre; U-Shape Setup → U-Shape
const SERVICE_LAYOUT_TO_HALL: Record<string, string> = {
  boardroom: "meeting",
  theater: "theatre",
  "u-shape": "u-shape",
};
const HALL_LAYOUT_SERVICE_IDS = ["u-shape", "boardroom", "theater"] as const;

function AddOnCard({
  addOn,
  selected,
  onToggle,
}: {
  addOn: BookingAddOn;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle();
        }
      }}
      className={cn(
        "flex overflow-hidden rounded-xl border-2 bg-white transition-all group cursor-pointer shadow-sm hover:shadow-md",
        selected
          ? "border-accent bg-accent/5 shadow-md ring-2 ring-accent/20"
          : "border-border hover:border-accent/50 hover:bg-accent/5"
      )}
    >
      <div className="relative w-28 sm:w-32 flex-shrink-0 aspect-[4/3] bg-muted overflow-hidden">
        <Image
          src={addOn.img || ""}
          alt=""
          fill
          className="object-cover"
          sizes="(max-width: 640px) 112px, 128px"
        />
        <span className="absolute bottom-2 right-2 rounded-md bg-foreground/90 px-2 py-1 text-xs font-semibold text-background shadow-sm">
          ${addOn.price}
        </span>
      </div>
      <div className="flex-1 min-w-0 p-4 flex flex-col justify-center text-left">
        <p className="text-base font-semibold leading-tight text-foreground group-hover:text-accent transition-colors">
          {addOn.name}
        </p>
        <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed line-clamp-2">
          {addOn.description}
        </p>
      </div>
    </div>
  );
}

export default function Book() {
  const router = useRouter();
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(1);
  const [date, setDate] = useState<Date>();
  const [totalPrice, setTotalPrice] = useState(0);
  const [isAvailable, setIsAvailable] = useState(true);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [isConfirmingBooking, setIsConfirmingBooking] = useState(false);
  const [bookingReference, setBookingReference] = useState("");
  const [referenceCopied, setReferenceCopied] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, boolean>>({});
  const [emailErrorMessage, setEmailErrorMessage] = useState<string | null>(null);
  const [phoneErrorMessage, setPhoneErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const pendingNavigationRef = useRef<string | "back" | null>(null);

  const { data: bookPageData, isLoading: bookPageLoading, isError: bookPageError } = useQuery({
    queryKey: ["strapi", "book-from-page"],
    queryFn: fetchBookPage,
    enabled: isStrapiConfigured(),
    staleTime: 60_000,
  });
  const { data: apiAddOns = [], isLoading: addOnsLoading, isError: addOnsError } = useQuery({
    queryKey: ["strapi", "add-ons"],
    queryFn: fetchAddOns,
    enabled: isStrapiConfigured(),
    staleTime: 60_000,
  });
  const { data: apiEventTypes = [], isLoading: eventTypesLoading, isError: eventTypesError } = useQuery({
    queryKey: ["strapi", "event-types"],
    queryFn: fetchEventTypes,
    enabled: isStrapiConfigured(),
    staleTime: 60_000,
  });
  const { data: apiServiceLayouts = [], isLoading: serviceLayoutsLoading, isError: serviceLayoutsError } = useQuery({
    queryKey: ["strapi", "service-layouts"],
    queryFn: () => fetchServiceLayouts(),
    enabled: isStrapiConfigured(),
    staleTime: 60_000,
  });
  const { data: apiGuestTypes = [], isLoading: guestTypesLoading, isError: guestTypesError } = useQuery({
    queryKey: ["strapi", "guest-types"],
    queryFn: fetchGuestTypes,
    enabled: isStrapiConfigured(),
    staleTime: 60_000,
  });
  const { data: configsData } = useQuery({
    queryKey: ["strapi", "configs"],
    queryFn: fetchConfigs,
    enabled: isStrapiConfigured(),
    staleTime: 60_000,
  });

  const strapiConfigured = isStrapiConfigured();
  // Room/Space is derived from selected layout; display names for review/display only
  const roomSpaceLabels = useMemo(() => ({ ...ROOM_SPACE_LABELS }), []);
  const addOnsList = useMemo(() => {
    const mapped = mapStrapiAddOns(apiAddOns);
    if (strapiConfigured && addOnsLoading) return [];
    if (strapiConfigured && addOnsError) return bookingAddOns;
    return mapped.length > 0 ? mapped : bookingAddOns;
  }, [apiAddOns, strapiConfigured, addOnsError, addOnsLoading]);
  const eventTypesList = useMemo(() => {
    const mapped = mapStrapiEventTypes(apiEventTypes);
    if (strapiConfigured && eventTypesLoading) return [];
    if (strapiConfigured && eventTypesError) return eventTypes;
    return mapped.length > 0 ? mapped : eventTypes;
  }, [apiEventTypes, strapiConfigured, eventTypesError, eventTypesLoading]);
  const serviceLayoutsMap = useMemo(() => {
    const mapped = mapStrapiServiceLayouts(apiServiceLayouts);
    if (strapiConfigured && serviceLayoutsLoading) return {};
    if (strapiConfigured && serviceLayoutsError) return serviceLayouts;
    return Object.keys(mapped).length > 0 ? mapped : serviceLayouts;
  }, [apiServiceLayouts, strapiConfigured, serviceLayoutsError, serviceLayoutsLoading]);
  const guestTypesList = useMemo(() => {
    const mapped = mapStrapiGuestTypes(apiGuestTypes);
    if (strapiConfigured && guestTypesLoading) return [];
    if (strapiConfigured && guestTypesError) return [...GUEST_TYPES_FALLBACK];
    return mapped.length > 0 ? mapped : [...GUEST_TYPES_FALLBACK];
  }, [apiGuestTypes, strapiConfigured, guestTypesError, guestTypesLoading]);

  const getEventTypeName = () => {
    const selectedEventType = eventTypesList.find((e) => e.id === formData.eventType);
    return selectedEventType?.label || formData.eventType || "";
  };

  const heroEyebrow = bookPageData?.heroEyebrow ?? "Reserve Your Space";
  const heroTitle = bookPageData?.heroTitle ?? "Book Your Premium Environment";
  const heroDescription = bookPageData?.heroDescription ?? "Reserve your ideal business environment in just a few steps. Professional spaces designed for visionary minds.";
  const heroImageSrc = getBookPageHeroImageUrl(bookPageData ?? null);
  const helpCard = {
    title: heroTitle,
  }
  const bookPageFeatures = useMemo(() => {
    const mapped = mapBookPageFeatures(bookPageData ?? null);
    if (mapped.length > 0) return mapped;
    if (strapiConfigured && bookPageError) {
      return [
        { title: "Instant Confirmation", description: "Receive booking confirmation and details immediately via email" },
        { title: "Dedicated Support", description: "Personal assistance throughout your booking and event" },
        { title: "Flexible Modifications", description: "Easy booking changes up to 48 hours before your event" },
      ];
    }
    if (strapiConfigured && bookPageLoading) return [];
    return [
      { title: "Instant Confirmation", description: "Receive booking confirmation and details immediately via email" },
      { title: "Dedicated Support", description: "Personal assistance throughout your booking and event" },
      { title: "Flexible Modifications", description: "Easy booking changes up to 48 hours before your event" },
    ];
  }, [bookPageData, strapiConfigured, bookPageError, bookPageLoading]);
  const isLoadingBookPage = isStrapiConfigured() && bookPageLoading;
  const isErrorBookPage = isStrapiConfigured() && bookPageError;

  // Email format: local@domain.tld (e.g. admin@gmail.com)
  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const isValidEmail = (email: string) => EMAIL_REGEX.test(email.trim());

  // Refs for form fields to enable scrolling
  const serviceTypeRef = useRef<HTMLButtonElement>(null);
  const dateRef = useRef<HTMLButtonElement>(null);
  const endDateRef = useRef<HTMLButtonElement>(null);
  const startTimeRef = useRef<HTMLButtonElement>(null);
  const endTimeRef = useRef<HTMLButtonElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const attendeesRef = useRef<HTMLInputElement>(null);
  const layoutRef = useRef<HTMLButtonElement>(null);

  const [formData, setFormData] = useState<BookingFormData>({
    name: "",
    email: "",
    phone: "",
    company: "",
    eventType: "",
    guestType: "",
    serviceType: "",
    date: "",
    endDate: "",
    startTime: "",
    endTime: "",
    attendees: "",
    roomSpace: "",
    layoutId: "",
    addOns: [],
    message: "",
  });

  // Form has unsaved data (before completing booking)
  const hasUnsavedData = useMemo(() => {
    if (showConfirmation) return false; // Booking completed
    const d = formData;
    return !!(
      d.eventType?.trim() ||
      d.serviceType?.trim() ||
      d.date?.trim() ||
      d.attendees?.trim() ||
      d.name?.trim() ||
      d.email?.trim() ||
      d.phone?.trim() ||
      (d.addOns && d.addOns.length > 0) ||
      d.roomSpace?.trim() ||
      d.layoutId?.trim()
    );
  }, [formData, showConfirmation]);

  // beforeunload: browser dialog for tab close, refresh, or external navigation
  useEffect(() => {
    if (!hasUnsavedData) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedData]);

  // Intercept in-app link clicks (Next.js Link and plain <a> tags)
  useEffect(() => {
    if (!hasUnsavedData) return;

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const anchor = target.closest("a");
      if (!anchor || !anchor.href) return;
      const url = new URL(anchor.href, window.location.origin);
      if (url.origin !== window.location.origin) return;
      const path = url.pathname + url.search;
      if (path === "/book" || path.startsWith("/book?")) return;
      e.preventDefault();
      e.stopPropagation();
      pendingNavigationRef.current = path;
      setShowLeaveConfirm(true);
    };

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [hasUnsavedData]);

  const handleLeaveConfirm = () => {
    const pending = pendingNavigationRef.current;
    pendingNavigationRef.current = null;
    setShowLeaveConfirm(false);
    if (pending && pending.startsWith("/")) {
      router.push(pending);
    }
  };

  const handleLeaveCancel = () => {
    pendingNavigationRef.current = null;
    setShowLeaveConfirm(false);
  };

  // Fetch existing bookings for selected date to check availability
  const { data: dateBookingsData, isError: bookingsApiError } = useQuery({
    queryKey: ["bookings", formData.date],
    queryFn: async () => {
      if (!formData.date) return { bookings: [] };
      const res = await fetch(`/api/booking?date=${encodeURIComponent(formData.date)}`);
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody?.error || `Availability check failed (${res.status})`);
      }
      return await res.json();
    },
    enabled: Boolean(formData.date && isStrapiConfigured()),
    staleTime: 0, // Always fetch fresh data for availability
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    retry: false, // Avoid repeated 401/502 retries
  });

  const existingBookings = useMemo(() => dateBookingsData?.bookings || [], [dateBookingsData]);
  // Only Confirm, Partial Payment, and Pay Later block the slot.
  // Pending does NOT block – multiple users can book the same room + layout for the same date/time until one is confirmed.
  // Cancelled does not block – the slot is freed for new bookings.
  const BLOCKING_STATUSES = useMemo(() => ['Confirm', 'Partial Payment', 'Pay Later'], []);
  const blockingBookings = useMemo(
    () =>
      existingBookings.filter((b: { status?: string }) => b.status && BLOCKING_STATUSES.includes(b.status)),
    [existingBookings, BLOCKING_STATUSES]
  );
  const availabilityLoadFailed = Boolean(isStrapiConfigured() && formData.date && bookingsApiError);

  // Check for time slot conflicts with existing bookings (only blocking statuses block the slot)
  // IMPORTANT: Availability is per-room only. One room being booked must NOT block other rooms.
  // When no room is selected, we cannot say "unavailable" - the user may pick an available room.
  const availabilityStatus = useMemo(() => {
    if (!formData.date || !formData.startTime || !formData.endTime || blockingBookings.length === 0) {
      return { available: true, conflicts: [], message: null };
    }

    // Only check conflicts when a specific room is selected. Without room selection,
    // we cannot mark unavailable - other rooms may still be free for the same slot.
    if (!formData.roomSpace) {
      return { available: true, conflicts: [], message: null };
    }

    const startMinutes = timeToMinutes(formData.startTime);
    const endMinutes = timeToMinutes(formData.endTime);

    // Conflicts are checked ONLY for the selected room - each room is independent
    const relevantBookings = blockingBookings.filter((b: any) => b.roomSpace === formData.roomSpace);

    const conflicts = relevantBookings.filter((booking: any) => {
      const bookingStart = timeToMinutes(booking.startTime);
      const bookingEnd = timeToMinutes(booking.endTime);
      
      // Check if times overlap
      return (startMinutes < bookingEnd && endMinutes > bookingStart);
    });

    if (conflicts.length === 0) {
      return { available: true, conflicts: [], message: null };
    }

    // Generate detailed conflict message
    const roomName = formData.roomSpace ? roomSpaceLabels[formData.roomSpace] || formData.roomSpace : "this space";
    const conflictTimes = conflicts.map((c: any) => `${c.startTime} - ${c.endTime}`).join(", ");
    
    const message = formData.roomSpace
      ? `${roomName} is already booked for ${conflictTimes} on this date. Please select a different time slot or room.`
      : `Time slots ${conflictTimes} are already booked on this date. Please select a different time.`;

    return { available: false, conflicts, message };
  }, [formData.date, formData.startTime, formData.endTime, formData.roomSpace, blockingBookings, roomSpaceLabels]);

  const selectedEventType = eventTypesList.find((e) => e.id === formData.eventType);
  const isMultiDay = selectedEventType?.isMultiDay ?? false;

  // Date and time are selected (required before showing Room/Space and Layout)
  const hasDateTimeSelected = Boolean(
    formData.date && formData.startTime && formData.endTime &&
    (!isMultiDay || formData.endDate)
  );

  // Rooms with a conflicting booking for the selected time slot (only blocking statuses count)
  const getRoomsWithConflictForSlot = useMemo(() => {
    if (!formData.date || !formData.startTime || !formData.endTime || blockingBookings.length === 0) {
      return new Set<string>();
    }
    const startM = timeToMinutes(formData.startTime);
    const endM = timeToMinutes(formData.endTime);
    const conflictingRoomIds = new Set<string>();
    for (const b of blockingBookings as { roomSpace?: string; startTime: string; endTime: string }[]) {
      const roomId = b.roomSpace ?? "";
      if (!roomId) continue;
      const bStart = timeToMinutes(b.startTime);
      const bEnd = timeToMinutes(b.endTime);
      if (startM < bEnd && endM > bStart) {
        conflictingRoomIds.add(roomId);
      }
    }
    return conflictingRoomIds;
  }, [formData.date, formData.startTime, formData.endTime, blockingBookings]);

  // Sync endDate (Date) from formData.endDate for calendar display
  useEffect(() => {
    if (formData.endDate) {
      const d = new Date(formData.endDate);
      if (!isNaN(d.getTime())) setEndDate(d);
    } else {
      setEndDate(undefined);
    }
  }, [formData.endDate]);

  // Calculate price whenever relevant fields change (supports multi-day via getTotalDurationMinutes)
  useEffect(() => {
    // Price is only meaningful once a specific layout (and therefore room/space) has been chosen.
    if (!formData.layoutId) {
      setTotalPrice(0);
      return;
    }
    if (formData.serviceType && formData.date && formData.startTime && formData.endTime) {
      const totalMinutes = isMultiDay && formData.endDate
        ? getTotalDurationMinutes(formData.date, formData.startTime, formData.endDate, formData.endTime)
        : timeToMinutes(formData.endTime) - timeToMinutes(formData.startTime);
      if (totalMinutes > 0) {
        // Find pricing for the currently selected room/space (from layouts → roomSpace relation).
        let roomRate: number | undefined;
        let roomPricingType: string | undefined;
        let shiftCount: number | undefined;
        if (formData.roomSpace) {
          for (const key of Object.keys(serviceLayoutsMap)) {
            const layouts = serviceLayoutsMap[key] || [];
            const match = layouts.find((l: any) => (l as any).roomSpace === formData.roomSpace);
            if (match) {
              const m: any = match;
              roomRate = typeof m.rate === 'number' ? m.rate : Number(m.rate ?? 0) || undefined;
              roomPricingType = typeof m.pricingType === 'string' ? m.pricingType : undefined;
              if (
                roomPricingType &&
                roomPricingType.toLowerCase().includes("shift") &&
                formData.date &&
                formData.startTime &&
                formData.endTime
              ) {
                const endDateForShift = isMultiDay ? formData.endDate : undefined;
                shiftCount = countShiftsInRange(
                  formData.date,
                  formData.startTime,
                  endDateForShift,
                  formData.endTime
                );
              }
              break;
            }
          }
        }
        const price = calculateBookingPrice(
          formData.serviceType,
          totalMinutes,
          formData.addOns,
          addOnsList,
          roomRate,
          roomPricingType,
          shiftCount
        );
        setTotalPrice(price);
      }
    }
  }, [formData.serviceType, formData.date, formData.endDate, formData.startTime, formData.endTime, formData.addOns, formData.layoutId, isMultiDay, addOnsList, formData.roomSpace, serviceLayoutsMap]);

  // Validate time slot: only require end after start (no min/max duration restriction)
  useEffect(() => {
    if (!formData.startTime || !formData.endTime) {
      setValidationErrors([]);
      return;
    }
    const errors: string[] = [];
    if (isMultiDay && formData.endDate) {
      const total = getTotalDurationMinutes(formData.date, formData.startTime, formData.endDate, formData.endTime);
      if (total <= 0) {
        errors.push("End date & time must be after start date & time");
        setIsAvailable(false);
      } else {
        setIsAvailable(true);
      }
    } else {
      const startM = timeToMinutes(formData.startTime);
      const endM = timeToMinutes(formData.endTime);
      if (endM <= startM) {
        errors.push("End time must be after start time");
        setIsAvailable(false);
      } else {
        setIsAvailable(true);
      }
    }
    setValidationErrors(errors);
  }, [formData.date, formData.endDate, formData.startTime, formData.endTime, isMultiDay]);

  // Clear room and layout when date or time changes (slot availability may have changed)
  useEffect(() => {
    setFormData((prev) => (prev.roomSpace || prev.layoutId ? { ...prev, roomSpace: "", layoutId: "" } : prev));
  }, [formData.date, formData.startTime, formData.endTime, formData.endDate]);

  const handleChange = (
      e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const fieldName = e.target.name;
    let value = e.target.value;

    // 🔒 Allow only digits for attendees
    if (fieldName === "attendees") {
      value = value.replace(/\D/g, ""); // removes letters, symbols, spaces

      if (!value) {
        setAttendeesError(null);
      } else {
        const num = Number(value);
        const hasSelectedLayouts = selectedLayoutIds.length > 0;
        const layoutsForCapacity = hasSelectedLayouts
            ? selectedLayoutIds
            : formData.layoutId
                ? [formData.layoutId]
                : [];

        let totalCapacity: number | undefined;
        if (layoutsForCapacity.length > 0) {
          const allLayouts = ([] as (ServiceLayout & { roomSpace?: string })[]).concat(
            ...Object.values(serviceLayoutsMap)
          );
          const selectedLayout = allLayouts.find((l) => l.id === formData.layoutId || selectedLayoutIds.includes(l.id));
          if (selectedLayout) {
            totalCapacity = selectedLayout.capacity;
          }
        }

        if (
            totalCapacity !== undefined &&
            !Number.isNaN(num) &&
            num > totalCapacity
        ) {
            setAttendeesError(
                `Expected attendees cannot exceed the capacity of the selected layout (${totalCapacity} guests).`
            );
        } else {
          setAttendeesError(null);
        }
      }
    }

    if (fieldName === "phone") {
      // Allow international format: +, digits, spaces, dashes, parentheses, dots
      value = value.replace(/[^\d+\s\-().]/g, "");
      if (value.length > 25) value = value.slice(0, 25);

      if (value.length === 0) {
        setFieldErrors((prev) => ({ ...prev, phone: false }));
        setPhoneErrorMessage(null);
      } else {
        const result = validateInternationalPhone(value);
        if (!result.valid) {
          setFieldErrors((prev) => ({ ...prev, phone: true }));
          setPhoneErrorMessage(result.errorMessage ?? "Enter a valid international phone number.");
        } else {
          setFieldErrors((prev) => ({ ...prev, phone: false }));
          setPhoneErrorMessage(null);
        }
      }
    }

    setFormData({
      ...formData,
      [fieldName]: value,
    });

    // Clear field error when typing
    if (fieldErrors[fieldName]) {
      setFieldErrors({
        ...fieldErrors,
        [fieldName]: false,
      });
    }
    if (fieldName === "email") {
      setEmailErrorMessage(null);
    }
  };


  const handleEventTypeChange = (value: string) => {
    const event = eventTypesList.find((e) => e.id === value);
    if (!event) return;
    setFormData((prev) => ({
      ...prev,
      eventType: value,
      serviceType: event.serviceType,
      roomSpace: "",
      layoutId: "",
      ...(event.isMultiDay ? {} : { endDate: "" }),
    }));
    setSelectedLayoutIds([]);
    if (fieldErrors.serviceType) {
      setFieldErrors({ ...fieldErrors, serviceType: false });
    }
  };

  const handleRoomSpaceChange = (_value: string) => {
    // Room/Space is now derived from selected layout; no direct selection
  };

  const handleLayoutToggle = (value: string) => {
    const layout = availableLayouts.find((l) => l.id === value);
    setSelectedLayoutIds((prev) => {
      const isAlreadySelected = prev.length === 1 && prev[0] === value;
      const next = isAlreadySelected ? [] : [value];
      setFormData((current) => ({
        ...current,
        layoutId: next[0] ?? "",
        roomSpace: next[0] && layout ? (layout as { roomSpace?: string }).roomSpace ?? "" : "",
      }));
      return next;
    });
  };

  const handleDialogLayoutToggle = (value: string) => {
    setDialogLayoutIds((prev) => {
      const isAlreadySelected = prev.length === 1 && prev[0] === value;
      return isAlreadySelected ? [] : [value];
    });
  };

  const handleLayoutDialogSave = () => {
    const selectedId = dialogLayoutIds[0] ?? "";
    const selectedLayout = availableLayouts.find((l) => l.id === selectedId);
    const roomSpaceFromLayout = selectedLayout ? (selectedLayout as { roomSpace?: string }).roomSpace ?? "" : "";
    setSelectedLayoutIds(dialogLayoutIds);
    setFormData((current) => ({
      ...current,
      layoutId: selectedId,
      roomSpace: roomSpaceFromLayout,
    }));
    if (fieldErrors.layoutId) setFieldErrors((prev) => ({ ...prev, layoutId: false }));
    setIsLayoutDialogOpen(false);
    setLayoutSearchQuery("");
  };

  const handleLayoutDialogCancel = () => {
    setDialogLayoutIds(selectedLayoutIds);
    setIsLayoutDialogOpen(false);
    setLayoutSearchQuery("");
  };

  const handleAddOnToggle = (addOnId: string) => {
    setFormData({
      ...formData,
      addOns: formData.addOns.includes(addOnId)
        ? formData.addOns.filter((id) => id !== addOnId)
        : [...formData.addOns, addOnId],
    });
  };

  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [isEndDatePickerOpen, setIsEndDatePickerOpen] = useState(false);
  const [endDate, setEndDate] = useState<Date>();
  const [isStartTimeOpen, setIsStartTimeOpen] = useState(false);
  const [isEndTimeOpen, setIsEndTimeOpen] = useState(false);
  const [isLayoutDialogOpen, setIsLayoutDialogOpen] = useState(false);
  const [layoutSearchQuery, setLayoutSearchQuery] = useState("");
  const [selectedLayoutIds, setSelectedLayoutIds] = useState<string[]>([]);
  const [dialogLayoutIds, setDialogLayoutIds] = useState<string[]>([]);
  const [attendeesError, setAttendeesError] = useState<string | null>(null);

  // Sync selectedLayoutIds with formData.layoutId
  useEffect(() => {
    if (formData.layoutId) {
      setSelectedLayoutIds([formData.layoutId]);
    } else {
      setSelectedLayoutIds([]);
    }
  }, [formData.layoutId]);

  // Re-validate attendees vs selected layout capacity when layout or attendees change (e.g. user selects a new layout with sufficient capacity)
  useEffect(() => {
    const raw = formData.attendees?.trim();
    if (!raw) {
      setAttendeesError(null);
      return;
    }
    const num = Number(raw);
    if (Number.isNaN(num)) {
      setAttendeesError(null);
      return;
    }
    const layoutId = formData.layoutId;
    if (!layoutId) {
      setAttendeesError(null);
      return;
    }
    const allLayouts = ([] as (ServiceLayout & { roomSpace?: string })[]).concat(
      ...Object.values(serviceLayoutsMap)
    );
    const selectedLayout = allLayouts.find((l) => l.id === layoutId);
    if (!selectedLayout) {
      setAttendeesError(null);
      return;
    }
    const totalCapacity = selectedLayout.capacity;
    if (totalCapacity === undefined) {
      setAttendeesError(null);
      return;
    }
    if (num > totalCapacity) {
      setAttendeesError(
        `Expected attendees cannot exceed the capacity of the selected layout (${totalCapacity} guests).`
      );
    } else {
      setAttendeesError(null);
    }
  }, [formData.layoutId, formData.attendees, serviceLayoutsMap]);

  // Minutes restricted to 00, 15, 30, 45 only
  const MINUTES_QUARTER = [0, 15, 30, 45];
  const snapToQuarter = (m: number) => MINUTES_QUARTER.reduce((prev, curr) =>
    Math.abs(curr - m) < Math.abs(prev - m) ? curr : prev
  );

  // Parse "HH:mm" to { hour12, minute, ampm } for display (hour12 is 1-12); minute snapped to quarter
  const parseTime = (time: string): { hour12: number; minute: number; ampm: "AM" | "PM" } => {
    if (!time || !/^\d{2}:\d{2}$/.test(time)) return { hour12: 12, minute: 0, ampm: "AM" };
    const [h, m] = time.split(":").map(Number);
    const hour24 = h;
    const minute = snapToQuarter(m);
    const ampm: "AM" | "PM" = hour24 >= 12 ? "PM" : "AM";
    const hour12 = hour24 % 12 || 12;
    return { hour12, minute, ampm };
  };
  // Build "HH:mm" from hour12 (1-12), minute (0|15|30|45), ampm
  const buildTime = (hour12: number, minute: number, ampm: "AM" | "PM") => {
    const m = MINUTES_QUARTER.includes(minute) ? minute : snapToQuarter(minute);
    let hour24 = hour12 === 12 ? (ampm === "AM" ? 0 : 12) : (ampm === "PM" ? hour12 + 12 : hour12);
    return `${String(hour24).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  };

  const HOURS_12 = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  const AMPM = ["AM", "PM"] as const;

  // Same-day booking: filter time slots by exact current time (hours + minutes)
  const getCurrentMinutes = () => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  };
  // Parse selected date as local so "today" is correct in all timezones
  const isStartDateToday = formData.date
    ? (() => {
        const [y, mo, d] = formData.date.split("-").map(Number);
        const selectedLocal = new Date(y, mo - 1, d);
        return selectedLocal.toDateString() === new Date().toDateString();
      })()
    : false;
  const currentMinutes = getCurrentMinutes();
  // Disable only slots strictly earlier than current time (full timestamp: hours + minutes + AM/PM); current time and later stay selectable
  const isStartTimeOptionDisabled = (hour12: number, minute: number, ampm: "AM" | "PM") =>
    isStartDateToday && timeToMinutes(buildTime(hour12, minute, ampm)) < currentMinutes;
  // Hour column: disable only when the latest slot in that hour (h:45 PM) is strictly before current time
  const isStartTimeHourDisabled = (hour12: number) =>
    isStartDateToday && timeToMinutes(buildTime(hour12, 45, "PM")) < currentMinutes;
  // AM/PM column: disable only when the latest slot in that period for the selected hour (h:45 AM or h:45 PM) is past; never disable entire period so future times remain selectable
  const isStartTimeAmPmDisabled = (hour12: number, ampm: "AM" | "PM") =>
    isStartDateToday && timeToMinutes(buildTime(hour12, 45, ampm)) < currentMinutes;
  const isStartTimePast =
    !!formData.startTime &&
    isStartDateToday &&
    timeToMinutes(formData.startTime) < currentMinutes;

  const handleDateSelect = (selectedDate: Date | undefined) => {
    setDate(selectedDate);
    if (selectedDate) {
      setFormData({
        ...formData,
        date: format(selectedDate, "yyyy-MM-dd"),
      });
      setIsDatePickerOpen(false);
      if (fieldErrors.date) {
        setFieldErrors({ ...fieldErrors, date: false });
      }
    }
  };

  const handleEndDateSelect = (selectedDate: Date | undefined) => {
    setEndDate(selectedDate);
    if (selectedDate) {
      setFormData({
        ...formData,
        endDate: format(selectedDate, "yyyy-MM-dd"),
      });
      setIsEndDatePickerOpen(false);
      if (fieldErrors.endDate) {
        setFieldErrors({ ...fieldErrors, endDate: false });
      }
    }
  };

  const scrollToField = (ref: React.RefObject<HTMLElement>) => {
    if (ref.current) {
      const yOffset = -150; // Offset for sticky header
      const element = ref.current;
      const y = element.getBoundingClientRect().top + window.pageYOffset + yOffset;

      window.scrollTo({ top: y, behavior: 'smooth' });

      // Focus the element after scrolling
      setTimeout(() => {
        element.focus();
      }, 500);
    }
  };

  const validateStep = (step: number): boolean => {
    if (step === 1) {
      const errors: Record<string, boolean> = {};
      let firstInvalidField: React.RefObject<HTMLElement> | null = null;

      if (!formData.eventType || !formData.serviceType) {
        errors.serviceType = true;
        if (!firstInvalidField) firstInvalidField = serviceTypeRef;
      }
      if (!formData.date) {
        errors.date = true;
        if (!firstInvalidField) firstInvalidField = dateRef;
      }
      if (isMultiDay && !formData.endDate) {
        errors.endDate = true;
        if (!firstInvalidField) firstInvalidField = endDateRef;
      }
      if (formData.endDate && formData.date && formData.endDate < formData.date) {
        errors.endDate = true;
        if (!firstInvalidField) firstInvalidField = endDateRef;
      }
      if (!formData.startTime) {
        errors.startTime = true;
        if (!firstInvalidField) firstInvalidField = startTimeRef;
      }
      if (!formData.endTime) {
        errors.endTime = true;
        if (!firstInvalidField) firstInvalidField = endTimeRef;
      }
      const pastTimeErrorStep1 =
        !!formData.startTime &&
        !!formData.date &&
        new Date(formData.date).toDateString() === new Date().toDateString() &&
        timeToMinutes(formData.startTime) < (() => {
          const now = new Date();
          return now.getHours() * 60 + now.getMinutes();
        })();
      if (pastTimeErrorStep1) {
        errors.startTime = true;
        if (!firstInvalidField) firstInvalidField = startTimeRef;
      }
      if (!formData.attendees?.trim()) {
        errors.attendees = true;
        if (!firstInvalidField && attendeesRef) firstInvalidField = attendeesRef as unknown as React.RefObject<HTMLElement>;
      }
      if (attendeesError) {
        errors.attendees = true;
        if (!firstInvalidField && attendeesRef) {
          firstInvalidField = attendeesRef as unknown as React.RefObject<HTMLElement>;
        }
      }
      // Layout is required when date/time is selected (Room/Space is derived from layout)
      // Block whether layouts are available or not—no layouts = must try different time slot
      if (hasDateTimeSelected && !formData.layoutId?.trim()) {
        errors.layoutId = true;
        if (!firstInvalidField) firstInvalidField = layoutRef?.current ? (layoutRef as React.RefObject<HTMLElement>) : startTimeRef;
      }

      if (Object.keys(errors).length > 0) {
        setFieldErrors(errors);
        const layoutErrorMsg = availableLayouts.length === 0
          ? "No layouts available for the selected date, time, and participant count. Try a different time slot or contact us for assistance."
          : "Please select a Service Layout to continue.";
        const toastDescriptionStep1 = pastTimeErrorStep1
          ? "Cannot select a past time."
          : attendeesError
            ? attendeesError
            : errors.layoutId
              ? layoutErrorMsg
              : "Please fill in all required fields for booking details";
        toast({
          title: pastTimeErrorStep1 ? "Invalid Time" : "Missing Information",
          description: toastDescriptionStep1,
          variant: "destructive",
        });
        if (firstInvalidField) {
          scrollToField(firstInvalidField);
        }
        return false;
      }

      if (!finalAvailability) {
        const timeErrors: Record<string, boolean> = {
          startTime: true,
          endTime: true,
        };
        setFieldErrors(timeErrors);
        const errorMessage = !availabilityStatus.available 
          ? availabilityStatus.message || "Time slot is not available"
          : "End time must be after start time";
        toast({
          title: "Invalid Time Slot",
          description: validationErrors[0] || "Please select a valid time slot",
          variant: "destructive",
        });
        scrollToField(startTimeRef);
        return false;
      }
    }

    if (step === 2) {
      const errors: Record<string, boolean> = {};
      let firstInvalidField: React.RefObject<HTMLElement> | null = null;

      if (!formData.name?.trim()) {
        errors.name = true;
        if (!firstInvalidField) firstInvalidField = nameRef;
      }
      const emailTrimmed = formData.email?.trim() ?? "";
      if (!emailTrimmed) {
        errors.email = true;
        setEmailErrorMessage("Please enter your email address.");
        if (!firstInvalidField) firstInvalidField = emailRef;
      } else if (!isValidEmail(formData.email)) {
        errors.email = true;
        setEmailErrorMessage("Please enter a valid email address (e.g. admin@gmail.com).");
        if (!firstInvalidField) firstInvalidField = emailRef;
      } else {
        setEmailErrorMessage(null);
      }
      if (!formData.phone?.trim()) {
        errors.phone = true;
        setPhoneErrorMessage("Please enter your phone number with country code (e.g. +1 555 000 0000).");
        if (!firstInvalidField) firstInvalidField = phoneRef;
      } else {
        const phoneResult = validateInternationalPhone(formData.phone);
        if (!phoneResult.valid) {
          errors.phone = true;
          setPhoneErrorMessage(phoneResult.errorMessage ?? "Enter a valid international phone number.");
          if (!firstInvalidField) firstInvalidField = phoneRef;
        } else {
          setPhoneErrorMessage(null);
        }
      }

      if (Object.keys(errors).length > 0) {
        setFieldErrors(errors);
        const toastDescription = errors.email
          ? (emailTrimmed ? "Please enter a valid email address (e.g. admin@gmail.com)." : "Please enter your email address.")
          : "Please fill in all required contact fields";
        toast({
          title: "Missing Information",
          description: toastDescription,
          variant: "destructive",
        });
        if (firstInvalidField) {
          scrollToField(firstInvalidField);
        }
        return false;
      }
    }

    if (step === 3) {
      const errors: Record<string, boolean> = {};
      let firstInvalidField: React.RefObject<HTMLElement> | null = null;

      if (!formData.eventType || !formData.serviceType) {
        errors.serviceType = true;
        if (!firstInvalidField) firstInvalidField = serviceTypeRef;
      }
      if (!formData.date) {
        errors.date = true;
        if (!firstInvalidField) firstInvalidField = dateRef;
      }
      if (isMultiDay && !formData.endDate) {
        errors.endDate = true;
        if (!firstInvalidField) firstInvalidField = endDateRef;
      }
      if (formData.endDate && formData.date && formData.endDate < formData.date) {
        errors.endDate = true;
        if (!firstInvalidField) firstInvalidField = endDateRef;
      }
      if (!formData.startTime) {
        errors.startTime = true;
        if (!firstInvalidField) firstInvalidField = startTimeRef;
      }
      if (!formData.endTime) {
        errors.endTime = true;
        if (!firstInvalidField) firstInvalidField = endTimeRef;
      }
      const pastTimeErrorStep3 =
        !!formData.startTime &&
        !!formData.date &&
        new Date(formData.date).toDateString() === new Date().toDateString() &&
        timeToMinutes(formData.startTime) < (() => {
          const now = new Date();
          return now.getHours() * 60 + now.getMinutes();
        })();
      if (pastTimeErrorStep3) {
        errors.startTime = true;
        if (!firstInvalidField) firstInvalidField = startTimeRef;
      }
      if (!formData.attendees?.trim()) {
        errors.attendees = true;
        if (!firstInvalidField && attendeesRef) firstInvalidField = attendeesRef as unknown as React.RefObject<HTMLElement>;
      }
      if (attendeesError) {
        errors.attendees = true;
        if (!firstInvalidField && attendeesRef) firstInvalidField = attendeesRef as unknown as React.RefObject<HTMLElement>;
      }
      if (!finalAvailability) {
        errors.startTime = true;
        errors.endTime = true;
        if (!firstInvalidField) firstInvalidField = startTimeRef;
      }
      if (!formData.name?.trim()) {
        errors.name = true;
        if (!firstInvalidField) firstInvalidField = nameRef;
      }
      const emailTrimmedStep3 = formData.email?.trim() ?? "";
      if (!emailTrimmedStep3) {
        errors.email = true;
        if (!firstInvalidField) firstInvalidField = emailRef;
      } else if (!isValidEmail(formData.email)) {
        errors.email = true;
        setEmailErrorMessage("Please enter a valid email address (e.g. admin@gmail.com).");
        if (!firstInvalidField) firstInvalidField = emailRef;
      }
      if (!formData.phone?.trim()) {
        errors.phone = true;
        setPhoneErrorMessage("Please enter your phone number with country code (e.g. +1 555 000 0000).");
        if (!firstInvalidField) firstInvalidField = phoneRef;
      } else {
        const phoneResult = validateInternationalPhone(formData.phone);
        if (!phoneResult.valid) {
          errors.phone = true;
          setPhoneErrorMessage(phoneResult.errorMessage ?? "Enter a valid international phone number.");
          if (!firstInvalidField) firstInvalidField = phoneRef;
        } else {
          setPhoneErrorMessage(null);
        }
      }
      if (hasDateTimeSelected && !formData.layoutId?.trim()) {
        errors.layoutId = true;
        if (!firstInvalidField) firstInvalidField = layoutRef?.current ? (layoutRef as React.RefObject<HTMLElement>) : startTimeRef;
      }

      if (Object.keys(errors).length > 0) {
        setFieldErrors(errors);
        const toastDescriptionStep3 = pastTimeErrorStep3
          ? "Cannot select a past time."
          : "Please complete all required fields. Use Previous to review your booking details.";
        toast({
          title: pastTimeErrorStep3 ? "Invalid Time" : "Missing Information",
          description: toastDescriptionStep3,
          variant: "destructive",
        });
        return false;
      }
    }

    return true;
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(currentStep + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handlePrevious = () => {
    setCurrentStep(currentStep - 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateStep(3)) return;

    setIsSubmitting(true);
    setIsConfirmingBooking(true);

    try {
      const eventTypeName = getEventTypeName();
      const addOnIds = (formData.addOns?.length
        ? formData.addOns
            .map((selectedId) => {
              const match = apiAddOns.find(
                (a) => String(a.id) === selectedId || a.documentId === selectedId
              );
              return match?.id;
            })
            .filter((id): id is number => typeof id === "number")
        : []) as number[];

      const bookingPayload = {
        customerName: formData.name,
        customerEmail: formData.email,
        customerPhone: normalizeInternationalPhone(formData.phone),
        companyName: formData.company || undefined,
        guestType: formData.guestType || undefined,
        eventType: eventTypeName,
        serviceSlug: formData.serviceType,
        date: formData.date,
        endDate: formData.endDate || undefined,
        startTime: formData.startTime,
        endTime: formData.endTime,
        attendees: formData.attendees ? parseInt(formData.attendees, 10) : undefined,
        roomSpace: formData.roomSpace || undefined,
        layout: formData.layoutId
          ? isNaN(parseInt(formData.layoutId, 10))
            ? formData.layoutId
            : parseInt(formData.layoutId, 10)
          : undefined,
        addOnIds,
        message: formData.message || undefined,
        totalPrice,
      };
      const res = await fetch("/api/booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bookingPayload),
      });

      const json = await res.json();
      setIsConfirmingBooking(false);

      if (!res.ok || !json.success) {
        const is401 = res.status === 502 && /401|Unauthorized|invalid credentials/i.test(String(json.details || ""));
        const description = is401
          ? "We couldn't save your booking. Please try again or contact us."
          : (json.error || "Failed to create booking. Please try again.");
        toast({
          title: "Booking failed",
          description,
          variant: "destructive",
        });
        return;
      }

      setBookingReference(json.referenceNumber || "");
      setShowConfirmation(true);
      toast({
        title: "Booking submitted",
        description: `Your booking request has been received. Reference: ${json.referenceNumber || ""}`,
      });
    } catch (err) {
      setIsConfirmingBooking(false);
      const errorMessage = err instanceof Error ? err.message : "Something went wrong";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCloseConfirmation = () => {
    setShowConfirmation(false);
    setReferenceCopied(false);
    setTimeout(() => {
      setFormData({
        name: "",
        email: "",
        phone: "",
        company: "",
        eventType: "",
        guestType: "",
        serviceType: "",
        date: "",
        endDate: "",
        startTime: "",
        endTime: "",
        attendees: "",
        roomSpace: "",
        layoutId: "",
        addOns: [],
        message: "",
      });
      setDate(undefined);
      setEndDate(undefined);
      setCurrentStep(1);
      setTotalPrice(0);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 300);
  };

  const participantCount = formData.attendees ? parseInt(formData.attendees, 10) : 0;
  const isValidParticipantCount = !Number.isNaN(participantCount) && participantCount > 0;
  // Max capacity from all layouts (API + hall fallback); fallback 70 when no API data
  const maxParticipantCapacity = useMemo(() => {
    const fallbackHallMax = 70;
    let max = fallbackHallMax;
    for (const key of Object.keys(serviceLayoutsMap)) {
      const layouts = serviceLayoutsMap[key] || [];
      for (const l of layouts) {
        const cap = (l as { capacity?: number }).capacity ?? 0;
        if (cap > max) max = cap;
      }
    }
    return max;
  }, [serviceLayoutsMap]);
  const participantsExceedMax = participantCount > maxParticipantCapacity;

  // Clear room and layout when participant count exceeds max capacity
  useEffect(() => {
    const count = formData.attendees ? parseInt(formData.attendees, 10) : 0;
    if (Number.isNaN(count) || count <= 0) return;
    if (count > maxParticipantCapacity) {
      setFormData((prev) => (prev.roomSpace || prev.layoutId ? { ...prev, roomSpace: "", layoutId: "" } : prev));
    }
  }, [formData.attendees, maxParticipantCapacity]);
  // All layouts from Service Layout API (flattened); filter by participants, date/time availability only
  const availableLayoutsAll = useMemo(() => {
    const map = serviceLayoutsMap;
    const list: (ServiceLayout & { roomSpace?: string })[] = [];
    for (const key of Object.keys(map)) {
      const arr = map[key] || [];
      for (const l of arr) {
        list.push({ ...l, roomSpace: (l as { roomSpace?: string }).roomSpace });
      }
    }
    return list;
  }, [serviceLayoutsMap]);

  const isHallSelected = formData.roomSpace === "main-hall" || formData.roomSpace === "combined-hall";
  const isLoungeSelected = formData.roomSpace === "lounge";
  const availableLayoutsForHall =
    isHallSelected && formData.roomSpace
      ? getAvailableLayoutsForHall(formData.roomSpace, participantCount)
      : [];

  // Filter layouts by participant capacity and date/time availability.
  // Per-room only: only layouts in rooms with conflicting bookings are excluded.
  const layoutsFittingCapacityAndAvailable = availableLayoutsAll.filter((l: ServiceLayout & { roomSpace?: string }) => {
    if (isValidParticipantCount && !participantsExceedMax) {
      if (l.capacity < participantCount) return false;
    }
    if (hasDateTimeSelected && l.roomSpace && getRoomsWithConflictForSlot.has(l.roomSpace)) {
      return false;
    }
    return true;
  });
  let availableLayouts = layoutsFittingCapacityAndAvailable;

  // Rule C1 + Fallback: Show suggested room's layouts; if unavailable, use fallback (Lounge → Main Hall)
  const suggestedRoomSpace = getSuggestedRoomSpaceForParticipants(participantCount);
  let effectiveRoomSpace = suggestedRoomSpace;
  let roomFallbackMessage: string | null = null;

  const normalizeRoomSlug = (s: string | undefined | null) => (s ?? "").toLowerCase().trim();

  if (suggestedRoomSpace && isValidParticipantCount && hasDateTimeSelected) {
    const suggestedHasConflict = getRoomsWithConflictForSlot.has(suggestedRoomSpace);
    if (suggestedHasConflict) {
      const fallbacks = getRoomFallbackChain(suggestedRoomSpace);
      const firstAvailableFallback = fallbacks.find((r) => !getRoomsWithConflictForSlot.has(r));
      if (firstAvailableFallback) {
        effectiveRoomSpace = firstAvailableFallback;
        roomFallbackMessage = getRoomFallbackMessage(
          suggestedRoomSpace,
          effectiveRoomSpace,
          getRoomsWithConflictForSlot,
          roomSpaceLabels
        );
      }
    }
    availableLayouts = availableLayouts.filter(
      (l: ServiceLayout & { roomSpace?: string }) =>
        normalizeRoomSlug(l.roomSpace) === normalizeRoomSlug(effectiveRoomSpace)
    );
  } else if (suggestedRoomSpace && isValidParticipantCount) {
    availableLayouts = availableLayouts.filter(
      (l: ServiceLayout & { roomSpace?: string }) =>
        normalizeRoomSlug(l.roomSpace) === normalizeRoomSlug(suggestedRoomSpace)
    );
  }

  // When suggested room yields 0 layouts, show layouts from ANY available room (higher capacity)
  if (availableLayouts.length === 0 && isValidParticipantCount && layoutsFittingCapacityAndAvailable.length > 0) {
    availableLayouts = layoutsFittingCapacityAndAvailable;
    if (suggestedRoomSpace) {
      roomFallbackMessage = `${roomSpaceLabels[suggestedRoomSpace] ?? suggestedRoomSpace} layouts are not available for this slot. Showing layouts from alternative spaces; please note that pricing may be higher.`;
    }
  }

  // Show layouts whose capacity is nearest to participants (difference of 1–2 max)
  // When that yields 0, show any layout that fits (higher capacity)
  if (isValidParticipantCount && !participantsExceedMax && participantCount > 0) {
    const maxOverhead = roomFallbackMessage ? 999 : 2;
    const strictFiltered = availableLayouts.filter(
      (l: ServiceLayout & { roomSpace?: string }) => (l.capacity - participantCount) <= maxOverhead
    );
    availableLayouts = strictFiltered.length > 0 ? strictFiltered : availableLayouts;
  }
  // Sort by capacity (nearest first)
  availableLayouts = [...availableLayouts].sort((a, b) => a.capacity - b.capacity);

  // Fallback (dummy) only when no API layouts at all and we have hall selected from a previously selected layout
  const useHallFallbackLayouts =
    isHallSelected &&
    formData.roomSpace &&
    availableLayoutsAll.length === 0 &&
    availableLayoutsForHall.length > 0;

  if (useHallFallbackLayouts) {
    const hallHasConflict = hasDateTimeSelected && formData.roomSpace && getRoomsWithConflictForSlot.has(formData.roomSpace);
    availableLayouts = hallHasConflict
      ? []
      : availableLayoutsForHall.map((l) => ({
          ...l,
          description: getLayoutDisplayLabel(formData.roomSpace!, l.id),
          image: HALL_LAYOUT_IMAGES[l.id] ?? undefined,
          roomSpace: formData.roomSpace,
        }));
  }

  // Clear layoutId and roomSpace when the selected layout is no longer in availableLayouts, or when date/time/attendees change
  useEffect(() => {
    if (formData.layoutId) {
      const isLayoutStillValid = availableLayouts.some((l) => l.id === formData.layoutId);
      if (!isLayoutStillValid) {
        setFormData((prev) => ({ ...prev, layoutId: "", roomSpace: "" }));
        setSelectedLayoutIds([]);
      }
    }
  }, [availableLayouts, formData.layoutId]);

  const selectedService = formData.serviceType
    ? serviceTypeNames[formData.serviceType]
    : "";

  const selectedLayouts = availableLayouts.filter((l) =>
    selectedLayoutIds.includes(l.id)
  );

  const selectedAddOns = addOnsList.filter((a) => formData.addOns.includes(a.id));

  const totalAttendeesCapacity =
    selectedLayouts.length > 0
      ? selectedLayouts.reduce((sum, layout) => sum + layout.capacity, 0)
      : undefined;

  const totalDurationMinutes =
    formData.date && formData.startTime && formData.endTime
      ? isMultiDay && formData.endDate
        ? getTotalDurationMinutes(
            formData.date,
            formData.startTime,
            formData.endDate,
            formData.endTime
          )
        : timeToMinutes(formData.endTime) - timeToMinutes(formData.startTime)
      : 0;
  const duration = totalDurationMinutes / 60;
  const addOnsSubtotal = selectedAddOns.reduce((s, a) => s + a.price, 0);
  const serviceCost = totalPrice - addOnsSubtotal;
  // Derive display unit (/hour vs /shift) and effective unit rate for the summary
  let pricingUnit: "hour" | "shift" = "hour";
  let effectiveUnitCount = duration > 0 ? duration : 0;

  // Detect if current selection uses per-shift pricing
  let isPerShiftPricing = false;
  if (formData.roomSpace) {
    for (const key of Object.keys(serviceLayoutsMap)) {
      const layouts = serviceLayoutsMap[key] || [];
      const match = layouts.find((l: any) => (l as any).roomSpace === formData.roomSpace);
      if (match && typeof (match as any).pricingType === "string") {
        if ((match as any).pricingType.toLowerCase().includes("shift")) {
          isPerShiftPricing = true;
        }
        break;
      }
    }
  }

  if (isPerShiftPricing && formData.date && formData.startTime && formData.endTime) {
    const endDateForShift = isMultiDay ? formData.endDate : undefined;
    const shifts = countShiftsInRange(
      formData.date,
      formData.startTime,
      endDateForShift,
      formData.endTime
    );
    if (shifts > 0) {
      pricingUnit = "shift";
      effectiveUnitCount = shifts;
    }
  }

  const serviceRatePerUnit =
    effectiveUnitCount > 0 ? serviceCost / effectiveUnitCount : 0;

  const FEATURE_ICONS = [Clock, Users, CheckCircle2] as const;

  // Update isAvailable based on both validation and real-time availability
  const finalAvailability = isAvailable && availabilityStatus.available;

  return (
    <Layout>
    <AlertDialog open={showLeaveConfirm} onOpenChange={(open) => { if (!open) handleLeaveCancel(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Leave booking form?</AlertDialogTitle>
          <AlertDialogDescription>
            If you leave this page, your booking data will be lost. Are you sure you want to continue?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleLeaveCancel}>Cancel</AlertDialogCancel>
            <Button variant="gold" onClick={handleLeaveConfirm} size="default">OK</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <main className="min-h-screen pb-20">
      {isLoadingBookPage && (
        <div className="fixed top-0 left-0 right-0 z-50 h-1 bg-muted overflow-hidden">
          <motion.div
            className="h-full bg-accent"
            initial={{ width: "0%" }}
            animate={{ width: "70%" }}
            transition={{ duration: 0.8, repeat: Infinity, repeatDelay: 0.2 }}
            style={{ originX: 0 }}
          />
        </div>
      )}
      {isErrorBookPage && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 text-center py-2 px-4 text-sm">
          Unable to load latest content. Showing default content.
        </div>
      )}
      {isLoadingBookPage ? (
        <PageHeroSkeleton sectionClassName="py-32 md:py-28" />
      ) : (
      <PageHero
        eyebrow={heroEyebrow}
        title={heroTitle}
        description={heroDescription}
        imageSrc={heroImageSrc}
        imageAlt=""
        sectionClassName="py-32 md:py-28"
        titleClassName="text-[#B7974B]"
      />
      )}

      {/* Confirming booking (shown while API completes) */}
      <Dialog open={isConfirmingBooking} onOpenChange={(open) => { if (!open) return; }}>
        <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
          <DialogHeader className="text-center space-y-4">
            <div className="mx-auto w-16 h-16 bg-accent/10 rounded-full flex items-center justify-center">
              <Loader2 className="h-10 w-10 text-accent animate-spin" />
            </div>
            <DialogTitle className="heading-card">
              Creating your booking
            </DialogTitle>
            <DialogDescription className="text-body">
              Please wait while we save your booking request.
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>

      {/* Booking Success Modal */}
      <Dialog open={showConfirmation} onOpenChange={setShowConfirmation}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="text-center space-y-4">
            <div className="mx-auto w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center">
              <CheckCircle2 className="h-10 w-10 text-amber-600" />
            </div>
            <DialogTitle className="heading-card">
              Booking Request Received
            </DialogTitle>
            <DialogDescription className="text-body">
              Your booking is currently <strong>pending</strong>. Once the admin reviews and approves your request, you will be notified via email at {formData.email}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="bg-cream rounded-lg p-6 space-y-3">
              <p className="text-sm text-muted-foreground text-center">Your Booking Reference</p>
              <div className="bg-white border-2 border-accent rounded-lg p-4 flex items-center justify-center gap-2 flex-wrap">
                <p className="text-2xl font-heading font-bold text-accent text-center tracking-wider">
                  {bookingReference}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0 h-9 gap-1.5 border-accent text-accent hover:bg-accent/10"
                  onClick={async () => {
                    if (!bookingReference) return;
                    try {
                      await navigator.clipboard.writeText(bookingReference);
                      setReferenceCopied(true);
                      toast({ title: "Copied!", description: "Booking reference copied to clipboard." });
                      setTimeout(() => setReferenceCopied(false), 2000);
                    } catch {
                      toast({ title: "Copy failed", description: "Could not copy to clipboard.", variant: "destructive" });
                    }
                  }}
                >
                  {referenceCopied ? (
                    <>
                      <Check className="h-4 w-4" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      Copy
                    </>
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground text-center">
                Please save this reference number for your records
              </p>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-2">
              <div className="flex items-start gap-3">
                <Info className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-amber-900">
                  <p className="font-medium mb-1">What&apos;s Next?</p>
                  <ul className="space-y-1 text-xs">
                    <li>• You will receive an email once your booking is approved</li>
                    <li>• Contact us if you need to make changes or have questions</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <Button
              onClick={handleCloseConfirmation}
              variant="gold"
              size="lg"
              className="w-full h-12 font-semibold"
            >
              Done
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="w-full h-12"
              asChild
            >
              <a href="/bookings">View My Bookings</a>
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Layout / Setup Image Gallery Modal */}
      <Dialog
        open={isLayoutDialogOpen}
        onOpenChange={(open) => {
          const isHallMode = formData.roomSpace === "main-hall" || formData.roomSpace === "combined-hall";
          if (open && isHallMode && participantsExceedMax) {
            setIsLayoutDialogOpen(false);
            return;
          }
          setIsLayoutDialogOpen(open);
          if (open) {
            setDialogLayoutIds(selectedLayoutIds);
          } else {
            setLayoutSearchQuery("");
          }
        }}
      >
        <DialogContent className="max-w-6xl w-[95vw] max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Choose a Layout</DialogTitle>
            <DialogDescription asChild>
              <div>
                <p>Select one layout that fits your group. Only layouts whose capacity is nearest to your participant count are shown.</p>
                {formData.roomSpace && (
                  <span className="block mt-1.5 text-accent font-medium">
                    Room: {roomSpaceLabels[formData.roomSpace] || formData.roomSpace}
                  </span>
                )}
                {isValidParticipantCount && !participantsExceedMax && participantCount > 0 && suggestedRoomSpace && (
                  <span className="block mt-0.5 text-accent font-medium">
                    Showing layouts for {participantCount} participant{participantCount !== 1 ? "s" : ""} (capacity matched)
                  </span>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>

          {(() => {
            const isHallMode = formData.roomSpace === "main-hall" || formData.roomSpace === "combined-hall";
            if (isHallMode && participantsExceedMax) {
              return (
                <Alert className="border-amber-200 bg-amber-50 text-amber-900 mb-4">
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    No hall is available for more than {maxParticipantCapacity} participants.
                  </AlertDescription>
                </Alert>
              );
            }
            if (availableLayouts.length === 0 && formData.roomSpace) {
              return (
                <Alert className="border-amber-200 bg-amber-50 text-amber-900 mb-4">
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    No layouts available for the selected room{isValidParticipantCount ? ` and participant count` : ''}. Try adjusting your filters.
                  </AlertDescription>
                </Alert>
              );
            }
            return null;
          })()}

          {/* Search Bar */}
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search layouts by name, capacity, or description..."
                value={layoutSearchQuery}
                onChange={(e) => setLayoutSearchQuery(e.target.value)}
                className="pl-10 h-12 text-base border-2 focus:border-accent"
              />
            </div>
          </div>

          {/* Filtered Layouts Grid with Scroll - Show only 2 rows */}
          <div className="overflow-y-auto pr-3 max-h-[420px] custom-scrollbar">
            {(() => {
              // Apply search filter
              let filteredLayouts = availableLayouts.filter((layout) => {
                if (!layoutSearchQuery.trim()) return true;
                const query = layoutSearchQuery.toLowerCase();
                return (
                  layout.name.toLowerCase().includes(query) ||
                  layout.description.toLowerCase().includes(query) ||
                  layout.capacity.toString().includes(query)
                );
              });

              // availableLayouts is already filtered to suggested room only (Rule C1) and capacity
              // Sort by capacity
              filteredLayouts = [...filteredLayouts].sort((a, b) => a.capacity - b.capacity);

              if (filteredLayouts.length === 0) {
                return (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Search className="h-12 w-12 text-muted-foreground mb-4 opacity-50" />
                    <p className="text-lg font-medium text-muted-foreground">No layouts found</p>
                    <p className="text-sm text-muted-foreground mt-2">
                      Try adjusting your search terms
                    </p>
                  </div>
                );
              }

              return (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 pb-4">
                  {filteredLayouts.map((layout) => (
                    <button
                      key={layout.id}
                      type="button"
                      onClick={() => {
                        handleDialogLayoutToggle(layout.id);
                      }}
                      className={cn(
                        "group relative w-full overflow-hidden rounded-lg border-2 text-left transition-colors duration-200",
                        dialogLayoutIds.includes(layout.id)
                          ? "border-accent ring-2 ring-accent/30 bg-accent/5"
                          : "border-border hover:border-accent/50"
                      )}
                    >
                      {/* Mobile & tablet: horizontal card with image left, details right */}
                      <div className="flex lg:hidden w-full items-stretch h-full">
                        <div className="relative h-24 w-24 flex-shrink-0 overflow-hidden">
                          {layout.image ? (
                            <Image
                              src={layout.image}
                              alt={layout.name}
                              fill
                              // sizes="(max-width: 1024px) 40vw"
                              className="object-cover"
                            />
                          ) : (
                            <div className="absolute inset-0 bg-muted flex items-center justify-center">
                              <span className="text-xl font-heading text-muted-foreground">
                                {layout.name.charAt(0)}
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="flex-1 px-3 flex flex-col justify-center gap-1 min-w-0">
                          <p className="font-semibold text-sm text-foreground line-clamp-1">
                            {layout.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Capacity: {layout.capacity}
                          </p>
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {layout.description}
                          </p>
                        </div>
                      </div>

                      {/* Desktop (lg+): original card layout with hover overlay */}
                      <div className="hidden lg:block w-full">
                        <div className="relative w-full aspect-[4/3]">
                          <div className="absolute inset-0 overflow-hidden rounded-lg">
                            {layout.image ? (
                              <Image
                                src={layout.image}
                                alt={layout.name}
                                fill
                                sizes="(max-width: 640px) 50vw, 20vw"
                                className="object-cover"
                              />
                            ) : (
                              <div className="absolute inset-0 bg-muted flex items-center justify-center">
                                <span className="text-xl font-heading text-muted-foreground">
                                  {layout.name.charAt(0)}
                                </span>
                              </div>
                            )}
                          </div>
                          <div className="absolute inset-0 rounded-lg bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col justify-end pt-4 pb-11 px-3">
                            <p className="text-white font-semibold text-xs sm:text-sm">{layout.name}</p>
                            <p className="text-white/90 text-xs mt-1">Capacity: {layout.capacity}</p>
                            <p className="text-white/80 text-xs mt-0.5 line-clamp-2">{layout.description}</p>
                          </div>
                          <div className="absolute bottom-0 left-0 right-0 p-2 bg-background/95 border-t border-border rounded-b-lg">
                            <p className="text-foreground font-medium text-xs sm:text-sm truncate">
                              {layout.name}
                            </p>
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              );
            })()}
          </div>
          <div className="mt-4 flex flex-col items-center gap-3 md:flex-row md:justify-between md:items-center border-t border-border pt-4">
            {dialogLayoutIds.length > 0 && (
                <p className="text-md text-muted-foreground mb-2 sm:mb-1">
                  Capacity of selected layout:{" "}
                  <span className="font-semibold">
                    {availableLayouts
                        .filter((l) => dialogLayoutIds.includes(l.id))
                        .reduce((sum, l) => sum + l.capacity, 0)}{" "}
                    guests
                  </span>
                </p>
            )}
            <div className="">
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="w-full sm:w-auto h-11 mr-4 mb-4 sm:mb-0"
              onClick={handleLayoutDialogCancel}
            >
              Cancel
            </Button>
              <Button
                type="button"
                variant="gold"
                size="lg"
                className="w-full sm:w-auto h-11"
                onClick={handleLayoutDialogSave}
                disabled={dialogLayoutIds.length === 0}
              >
                Save Layout Selection
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Progress Steps - on mobile scrolls with content (no sticky) to avoid layering/bleed; on desktop stays sticky */}
      <section className="bg-white border-b shadow-md md:sticky md:top-20 md:z-30 md:isolate">
        <div className="container-premium py-6">
          <motion.div
            className="flex items-center justify-center gap-2 sm:gap-4"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            {[1, 2, 3].map((step) => (
              <div key={step} className="flex items-center">
                <div className={cn(
                  "flex items-center gap-2 sm:gap-3 transition-all duration-300",
                  step > currentStep && "opacity-40"
                )}>
                  <div className={cn(
                    "w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center font-bold text-lg transition-all duration-300 shadow-sm",
                    step === currentStep && "bg-accent text-white shadow-gold scale-110",
                    step < currentStep && "bg-green-500 text-white shadow-sm",
                    step > currentStep && "bg-gray-100 text-gray-400 border-2 border-gray-200"
                  )}>
                    {step < currentStep ? <CheckCircle2 className="h-6 w-6" /> : step}
                  </div>
                  <span className={cn(
                    "font-semibold hidden sm:block text-sm md:text-base transition-colors",
                    step === currentStep && "text-accent",
                    step < currentStep && "text-green-600"
                  )}>
                    {step === 1 && "Booking Details"}
                    {step === 2 && "Your Information"}
                    {step === 3 && "Review & Confirm"}
                  </span>
                </div>
                {step < 3 && (
                  <div className={cn(
                    "w-12 sm:w-16 h-1 mx-2 sm:mx-4 rounded-full transition-all duration-300",
                    step < currentStep ? "bg-green-500" : "bg-gray-200"
                  )} />
                )}
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Form Section */}
      <section className="py-16 md:py-12 2xl:py-28 bg-cream">
        <div className="container-premium">
          <div className="grid lg:grid-cols-3 gap-8">
            {/* Main Form */}
            <motion.div
              className="lg:col-span-2"
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: false, amount: 0.15 }}
              transition={{ duration: 0.5 }}
            >
              <Card className="shadow-premium">
                <CardContent className="p-6 sm:p-8">
                  <form onSubmit={handleSubmit}>
                    {/* Step 1: Booking Details */}
                    {currentStep === 1 && (
                      <div className="space-y-8 animate-fade-in">
                        <div>
                          <h2 className="heading-card mb-2">
                            Booking Details
                          </h2>
                          <p className="text-body mb-6">
                            Choose your event type, date & time, and layout
                          </p>
                        </div>

                        <div className="space-y-6">

                          {/* Event Type */}
                          <div className="space-y-2">
                            <Label htmlFor="eventType" className="text-base font-medium">
                              Event Type *
                            </Label>
                            <Select
                                value={formData.eventType}
                                onValueChange={handleEventTypeChange}
                                disabled={strapiConfigured && eventTypesLoading}
                            >
                              <SelectTrigger
                                  ref={serviceTypeRef}
                                  id="eventType"
                                  className={cn(
                                      "h-14 text-base border-2 hover:border-accent/50 focus:border-accent transition-colors",
                                      fieldErrors.serviceType && "border-red-500 hover:border-red-600 focus:border-red-600"
                                  )}
                              >
                                <SelectValue placeholder={strapiConfigured && eventTypesLoading ? "Loading..." : "Choose your event type (small or large)"} />
                              </SelectTrigger>
                              <SelectContent className="shadow-elevated  overflow-y-auto w-[var(--radix-select-trigger-width)] sm:w-auto">
                                {eventTypesList.map((event) => (
                                    <SelectItem key={event.id} value={event.id} className="text-base py-3">
                                      <div className="flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-3">
                                          <MapPin className="h-5 w-5 text-accent" />
                                          <span className="font-medium">{event.label}</span>
                                        </div>
                                        <Badge
                                            variant="outline"
                                            className="hidden xs:inline-flex text-[11px] px-2 py-0.5 rounded-full border-accent/40 text-accent bg-accent/5"
                                        >
                                          {event.isMultiDay ? "Multi Day" : "Single Day"}
                                        </Badge>
                                      </div>
                                    </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          {/* Guest Type */}
                          <div className="space-y-2">
                            <Label htmlFor="guestType" className="text-base font-medium">
                              Guest Type
                            </Label>
                            <Select
                              value={formData.guestType ?? ""}
                              onValueChange={(value) => setFormData((prev) => ({ ...prev, guestType: value }))}
                              disabled={strapiConfigured && guestTypesLoading}
                            >
                              <SelectTrigger
                                id="guestType"
                                className="h-14 text-base border-2 hover:border-accent/50 focus:border-accent transition-colors"
                              >
                                <SelectValue placeholder={strapiConfigured && guestTypesLoading ? "Loading..." : "Select guest type"} />
                              </SelectTrigger>
                              <SelectContent className="shadow-elevated overflow-y-auto w-[var(--radix-select-trigger-width)] sm:w-auto">
                                {guestTypesList.map((type) => (
                                  <SelectItem key={type} value={type} className="text-base py-3">
                                    {type}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          {/* Number of Participants */}
                          <div className="space-y-2">
                            <Label htmlFor="attendees" className="text-base font-medium flex items-center gap-2">
                              <Users className="h-4 w-4 text-accent" />
                              Number of Participants *
                            </Label>
                            <Input
                                ref={attendeesRef}
                                id="attendees"
                                name="attendees"
                                type="text"
                                value={formData.attendees}
                                onChange={handleChange}
                                placeholder="Enter number of participants"
                                className={cn(
                                    "h-14 text-base border-2 hover:border-accent/50 focus:border-accent transition-colors",
                                    (fieldErrors.attendees || attendeesError) && "border-red-500 hover:border-red-600 focus:border-red-600"
                                )}
                                min="1"
                            />
                            {totalAttendeesCapacity !== undefined && (selectedLayouts.length > 0 || formData.layoutId) && (
                                <p className="text-xs text-muted-foreground">
                                  Capacity for selected layout:{" "}
                                  <span className="font-semibold">
                                  {totalAttendeesCapacity} guests
                                </span>
                                </p>
                            )}
                            {isValidParticipantCount && !attendeesError && !fieldErrors.attendees && (() => {
                              const suggested = getSuggestedRoomSpaceForParticipants(participantCount);
                              return suggested ? (
                                <p className="text-xs text-muted-foreground">
                                  Suggested for your group: {ROOM_SPACE_LABELS[suggested] ?? suggested}
                                </p>
                              ) : null;
                            })()}
                            {(fieldErrors.attendees || attendeesError) && (
                                <p className="text-xs text-red-600">
                                  {attendeesError ?? "Please enter the expected number of participants."}
                                </p>
                            )}
                          </div>

                          {/* Message when participants exceed max capacity */}
                          {participantsExceedMax && (
                              <Alert className="border-amber-200 bg-amber-50 text-amber-900">
                                <Info className="h-4 w-4" />
                                <AlertDescription>
                                  No hall or room is available for more than {maxParticipantCapacity} participants.
                                </AlertDescription>
                              </Alert>
                          )}

                          {/* Date & Time - shown after Participants; Room/Space and Layout appear only after date/time are selected */}
                          <div className="space-y-6">
                            {isMultiDay ? (
                              <>
                                {/* Multi-day: Row 1 - Start Date | Start Time */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                                  <div className="space-y-2">
                                    <Label className="text-base font-medium">Start Date *</Label>
                                    <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
                                      <PopoverTrigger asChild>
                                        <Button
                                          ref={dateRef}
                                          variant="outline"
                                          className={cn(
                                            "w-full h-14 justify-start text-left font-normal border-2 transition-colors hover:bg-[#FFF] hover:text-[#B08D39]",
                                            !date && "text-muted-foreground",
                                            date && "border-accent/30",
                                            fieldErrors.date && "border-red-500 hover:border-red-600"
                                          )}
                                        >
                                          <CalendarIcon className="mr-3 h-5 w-5 text-accent shrink-0" />
                                          <span className="text-base text-black truncate">
                                            {date ? format(date, "EEEE, MMMM dd, yyyy") : "Select start date"}
                                          </span>
                                        </Button>
                                      </PopoverTrigger>
                                      <PopoverContent className="w-auto p-0 shadow-elevated" align="start">
                                        <Calendar
                                          mode="single"
                                          selected={date}
                                          onSelect={handleDateSelect}
                                          disabled={(date) => {
                                            const d = new Date(date);
                                            d.setHours(0, 0, 0, 0);
                                            const todayStart = new Date();
                                            todayStart.setHours(0, 0, 0, 0);
                                            return d < todayStart || d < new Date("1900-01-01");
                                          }}
                                          initialFocus
                                          className="rounded-lg border-0"
                                        />
                                      </PopoverContent>
                                    </Popover>
                                  </div>
                                  <div className="space-y-2">
                                    <Label htmlFor="startTime" className="text-base font-medium flex items-center gap-2">
                                      <Clock className="h-4 w-4 text-accent" />
                                      Start Time *
                                    </Label>
                                    <Popover open={isStartTimeOpen} onOpenChange={setIsStartTimeOpen}>
                                      <PopoverTrigger asChild>
                                        <button
                                          ref={startTimeRef}
                                          type="button"
                                          id="startTime"
                                          className={cn(
                                            "flex h-14 w-full items-center justify-between rounded-md border-2 bg-background px-4 text-left text-base transition-colors hover:border-accent/50 focus:border-accent focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 cursor-pointer",
                                            fieldErrors.startTime && "border-red-500 hover:border-red-600 focus:border-red-600 focus:ring-red-500"
                                          )}
                                        >
                                          <span className={formData.startTime ? "text-foreground" : "text-muted-foreground"}>
                                            {formData.startTime ? formatTime(formData.startTime) : "-- : --"}
                                          </span>
                                          <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
                                        </button>
                                      </PopoverTrigger>
                                      <PopoverContent className="w-auto p-0 shadow-elevated" align="start" sideOffset={4}>
                                        <div className="flex border-b border-border">
                                          <div className="flex flex-col max-h-[220px] overflow-y-auto scrollbar-hide w-14 border-r border-border">
                                            {HOURS_12.map((h) => {
                                              const current = parseTime(formData.startTime);
                                              const isSelected = current.hour12 === h;
                                              const isPast = isStartTimeHourDisabled(h);
                                              return (
                                                <button
                                                  key={h}
                                                  type="button"
                                                  disabled={isPast}
                                                  onClick={() => {
                                                    if (isPast) return;
                                                    const next = buildTime(h, current.minute, current.ampm);
                                                    setFormData({ ...formData, startTime: next });
                                                    if (fieldErrors.startTime) setFieldErrors({ ...fieldErrors, startTime: false });
                                                  }}
                                                  className={cn(
                                                    "px-3 py-2 text-sm font-medium transition-colors hover:bg-muted",
                                                    isSelected ? "bg-[#B08D39] text-white hover:bg-[#9a7b32]" : "text-foreground",
                                                    isPast && "opacity-40 cursor-not-allowed hover:bg-transparent"
                                                  )}
                                                >
                                                  {String(h).padStart(2, "0")}
                                                </button>
                                              );
                                            })}
                                          </div>
                                          <div className="flex flex-col max-h-[220px] overflow-y-auto scrollbar-hide w-14 border-r border-border">
                                            {MINUTES_QUARTER.map((m) => {
                                              const current = parseTime(formData.startTime);
                                              const isSelected = current.minute === m;
                                              const isPast = isStartTimeOptionDisabled(current.hour12, m, current.ampm);
                                              return (
                                                <button
                                                  key={m}
                                                  type="button"
                                                  disabled={isPast}
                                                  onClick={() => {
                                                    if (isPast) return;
                                                    const next = buildTime(current.hour12, m, current.ampm);
                                                    setFormData({ ...formData, startTime: next });
                                                    if (fieldErrors.startTime) setFieldErrors({ ...fieldErrors, startTime: false });
                                                  }}
                                                  className={cn(
                                                    "px-3 py-2 text-sm font-medium transition-colors hover:bg-muted",
                                                    isSelected ? "bg-[#B08D39] text-white hover:bg-[#9a7b32]" : "text-foreground",
                                                    isPast && "opacity-40 cursor-not-allowed hover:bg-transparent"
                                                  )}
                                                >
                                                  {String(m).padStart(2, "0")}
                                                </button>
                                              );
                                            })}
                                          </div>
                                          <div className="flex flex-col max-h-[220px] overflow-y-auto scrollbar-hide w-12">
                                            {AMPM.map((a) => {
                                              const current = parseTime(formData.startTime);
                                              const isSelected = current.ampm === a;
                                              const isPast = isStartTimeAmPmDisabled(current.hour12, a);
                                              return (
                                                <button
                                                  key={a}
                                                  type="button"
                                                  disabled={isPast}
                                                  onClick={() => {
                                                    if (isPast) return;
                                                    const next = buildTime(current.hour12, current.minute, a);
                                                    setFormData({ ...formData, startTime: next });
                                                    if (fieldErrors.startTime) setFieldErrors({ ...fieldErrors, startTime: false });
                                                  }}
                                                  className={cn(
                                                    "px-2 py-2 text-sm font-medium transition-colors hover:bg-muted",
                                                    isSelected ? "bg-[#B08D39] text-white hover:bg-[#9a7b32]" : "text-foreground",
                                                    isPast && "opacity-40 cursor-not-allowed hover:bg-transparent"
                                                  )}
                                                >
                                                  {a}
                                                </button>
                                              );
                                            })}
                                          </div>
                                        </div>
                                        <p className="text-xs text-muted-foreground px-3 py-2 border-t border-border">Select hour, minute (00/15/30/45), and AM/PM</p>
                                      </PopoverContent>
                                    </Popover>
                                    {fieldErrors.startTime && isStartTimePast && (
                                      <p className="text-sm text-red-500">Cannot select a past time.</p>
                                    )}
                                  </div>
                                </div>
                                {/* Multi-day: Row 2 - End Date | End Time */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                                  <div className="space-y-2">
                                    <Label className="text-base font-medium">End Date *</Label>
                                    <Popover open={isEndDatePickerOpen} onOpenChange={setIsEndDatePickerOpen}>
                                      <PopoverTrigger asChild>
                                        <Button
                                          ref={endDateRef}
                                          variant="outline"
                                          className={cn(
                                            "w-full h-14 justify-start text-left font-normal border-2 transition-colors hover:bg-[#FFF] hover:text-[#B08D39]",
                                            !endDate && "text-muted-foreground",
                                            endDate && "border-accent/30",
                                            fieldErrors.endDate && "border-red-500 hover:border-red-600"
                                          )}
                                        >
                                          <CalendarIcon className="mr-3 h-5 w-5 text-accent shrink-0" />
                                          <span className="text-base text-black truncate">
                                            {endDate ? format(endDate, "EEEE, MMMM dd, yyyy") : "Select end date"}
                                          </span>
                                        </Button>
                                      </PopoverTrigger>
                                      <PopoverContent className="w-auto p-0 shadow-elevated" align="start">
                                        <Calendar
                                          mode="single"
                                          selected={endDate}
                                          onSelect={handleEndDateSelect}
                                          disabled={(d) => {
                                            const dNorm = new Date(d);
                                            dNorm.setHours(0, 0, 0, 0);
                                            if (!formData.date) {
                                              const todayStart = new Date();
                                              todayStart.setHours(0, 0, 0, 0);
                                              return dNorm < todayStart;
                                            }
                                            const start = new Date(formData.date);
                                            start.setHours(0, 0, 0, 0);
                                            return dNorm < start;
                                          }}
                                          initialFocus
                                          className="rounded-lg border-0"
                                        />
                                      </PopoverContent>
                                    </Popover>
                                  </div>
                                  <div className="space-y-2">
                                    <Label htmlFor="endTime" className="text-base font-medium flex items-center gap-2">
                                      <Clock className="h-4 w-4 text-accent" />
                                      End Time *
                                    </Label>
                                    <Popover open={isEndTimeOpen} onOpenChange={setIsEndTimeOpen}>
                                      <PopoverTrigger asChild>
                                        <button
                                          ref={endTimeRef}
                                          type="button"
                                          id="endTime"
                                          className={cn(
                                            "flex h-14 w-full items-center justify-between rounded-md border-2 bg-background px-4 text-left text-base transition-colors hover:border-accent/50 focus:border-accent focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 cursor-pointer",
                                            fieldErrors.endTime && "border-red-500 hover:border-red-600 focus:border-red-600 focus:ring-red-500"
                                          )}
                                        >
                                          <span className={formData.endTime ? "text-foreground" : "text-muted-foreground"}>
                                            {formData.endTime ? formatTime(formData.endTime) : "-- : --"}
                                          </span>
                                          <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
                                        </button>
                                      </PopoverTrigger>
                                      <PopoverContent className="w-auto p-0 shadow-elevated" align="start" sideOffset={4}>
                                        <div className="flex border-b border-border">
                                          <div className="flex flex-col max-h-[220px] overflow-y-auto scrollbar-hide w-14 border-r border-border">
                                            {HOURS_12.map((h) => {
                                              const current = parseTime(formData.endTime);
                                              const isSelected = current.hour12 === h;
                                              return (
                                                <button
                                                  key={h}
                                                  type="button"
                                                  onClick={() => {
                                                    const next = buildTime(h, current.minute, current.ampm);
                                                    setFormData({ ...formData, endTime: next });
                                                    if (fieldErrors.endTime) setFieldErrors({ ...fieldErrors, endTime: false });
                                                  }}
                                                  className={cn(
                                                    "px-3 py-2 text-sm font-medium transition-colors hover:bg-muted",
                                                    isSelected ? "bg-[#B08D39] text-white hover:bg-[#9a7b32]" : "text-foreground"
                                                  )}
                                                >
                                                  {String(h).padStart(2, "0")}
                                                </button>
                                              );
                                            })}
                                          </div>
                                          <div className="flex flex-col max-h-[220px] overflow-y-auto scrollbar-hide w-14 border-r border-border">
                                            {MINUTES_QUARTER.map((m) => {
                                              const current = parseTime(formData.endTime);
                                              const isSelected = current.minute === m;
                                              return (
                                                <button
                                                  key={m}
                                                  type="button"
                                                  onClick={() => {
                                                    const next = buildTime(current.hour12, m, current.ampm);
                                                    setFormData({ ...formData, endTime: next });
                                                    if (fieldErrors.endTime) setFieldErrors({ ...fieldErrors, endTime: false });
                                                  }}
                                                  className={cn(
                                                    "px-3 py-2 text-sm font-medium transition-colors hover:bg-muted",
                                                    isSelected ? "bg-[#B08D39] text-white hover:bg-[#9a7b32]" : "text-foreground"
                                                  )}
                                                >
                                                  {String(m).padStart(2, "0")}
                                                </button>
                                              );
                                            })}
                                          </div>
                                          <div className="flex flex-col max-h-[220px] overflow-y-auto scrollbar-hide w-12">
                                            {AMPM.map((a) => {
                                              const current = parseTime(formData.endTime);
                                              const isSelected = current.ampm === a;
                                              return (
                                                <button
                                                  key={a}
                                                  type="button"
                                                  onClick={() => {
                                                    const next = buildTime(current.hour12, current.minute, a);
                                                    setFormData({ ...formData, endTime: next });
                                                    if (fieldErrors.endTime) setFieldErrors({ ...fieldErrors, endTime: false });
                                                  }}
                                                  className={cn(
                                                    "px-2 py-2 text-sm font-medium transition-colors hover:bg-muted",
                                                    isSelected ? "bg-[#B08D39] text-white hover:bg-[#9a7b32]" : "text-foreground"
                                                  )}
                                                >
                                                  {a}
                                                </button>
                                              );
                                            })}
                                          </div>
                                        </div>
                                        <p className="text-xs text-muted-foreground px-3 py-2 border-t border-border">Select hour, minute (00/15/30/45), and AM/PM</p>
                                      </PopoverContent>
                                    </Popover>
                                  </div>
                                </div>
                              </>
                            ) : (
                              <>
                                {/* Single-day: existing layout - Date full width, then Start Time | End Time */}
                                <div className="space-y-2">
                                  <Label className="text-base font-medium">Date *</Label>
                                  <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
                                    <PopoverTrigger asChild>
                                      <Button
                                        ref={dateRef}
                                        variant="outline"
                                        className={cn(
                                          "w-full h-14 justify-start text-left font-normal border-2 transition-colors hover:bg-[#FFF] hover:text-[#B08D39]",
                                          !date && "text-muted-foreground",
                                          date && "border-accent/30",
                                          fieldErrors.date && "border-red-500 hover:border-red-600"
                                        )}
                                      >
                                        <CalendarIcon className="mr-3 h-5 w-5 text-accent" />
                                        <span className="text-base text-black ">
                                          {date ? format(date, "EEEE, MMMM dd, yyyy") : "Select your booking date"}
                                        </span>
                                      </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0 shadow-elevated" align="start">
                                      <Calendar
                                        mode="single"
                                        selected={date}
                                        onSelect={handleDateSelect}
                                        disabled={(date) => {
                                          const d = new Date(date);
                                          d.setHours(0, 0, 0, 0);
                                          const todayStart = new Date();
                                          todayStart.setHours(0, 0, 0, 0);
                                          return d < todayStart || d < new Date("1900-01-01");
                                        }}
                                        initialFocus
                                        className="rounded-lg border-0"
                                      />
                                    </PopoverContent>
                                  </Popover>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                                  <div className="space-y-2">
                                    <Label htmlFor="startTime" className="text-base font-medium flex items-center gap-2">
                                      <Clock className="h-4 w-4 text-accent" />
                                      Start Time *
                                    </Label>
                                    <Popover open={isStartTimeOpen} onOpenChange={setIsStartTimeOpen}>
                                      <PopoverTrigger asChild>
                                        <button
                                          ref={startTimeRef}
                                          type="button"
                                          id="startTime"
                                          className={cn(
                                            "flex h-14 w-full items-center justify-between rounded-md border-2 bg-background px-4 text-left text-base transition-colors hover:border-accent/50 focus:border-accent focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 cursor-pointer",
                                            fieldErrors.startTime && "border-red-500 hover:border-red-600 focus:border-red-600 focus:ring-red-500"
                                          )}
                                        >
                                          <span className={formData.startTime ? "text-foreground" : "text-muted-foreground"}>
                                            {formData.startTime ? formatTime(formData.startTime) : "-- : --"}
                                          </span>
                                          <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
                                        </button>
                                      </PopoverTrigger>
                                      <PopoverContent className="w-auto p-0 shadow-elevated" align="start" sideOffset={4}>
                                        <div className="flex border-b border-border">
                                          <div className="flex flex-col max-h-[220px] overflow-y-auto scrollbar-hide w-14 border-r border-border">
                                            {HOURS_12.map((h) => {
                                              const current = parseTime(formData.startTime);
                                              const isSelected = current.hour12 === h;
                                              const isPast = isStartTimeHourDisabled(h);
                                              return (
                                                <button
                                                  key={h}
                                                  type="button"
                                                  disabled={isPast}
                                                  onClick={() => {
                                                    if (isPast) return;
                                                    const next = buildTime(h, current.minute, current.ampm);
                                                    setFormData({ ...formData, startTime: next });
                                                    if (fieldErrors.startTime) setFieldErrors({ ...fieldErrors, startTime: false });
                                                  }}
                                                  className={cn(
                                                    "px-3 py-2 text-sm font-medium transition-colors hover:bg-muted",
                                                    isSelected ? "bg-[#B08D39] text-white hover:bg-[#9a7b32]" : "text-foreground",
                                                    isPast && "opacity-40 cursor-not-allowed hover:bg-transparent"
                                                  )}
                                                >
                                                  {String(h).padStart(2, "0")}
                                                </button>
                                              );
                                            })}
                                          </div>
                                          <div className="flex flex-col max-h-[220px] overflow-y-auto scrollbar-hide w-14 border-r border-border">
                                            {MINUTES_QUARTER.map((m) => {
                                              const current = parseTime(formData.startTime);
                                              const isSelected = current.minute === m;
                                              const isPast = isStartTimeOptionDisabled(current.hour12, m, current.ampm);
                                              return (
                                                <button
                                                  key={m}
                                                  type="button"
                                                  disabled={isPast}
                                                  onClick={() => {
                                                    if (isPast) return;
                                                    const next = buildTime(current.hour12, m, current.ampm);
                                                    setFormData({ ...formData, startTime: next });
                                                    if (fieldErrors.startTime) setFieldErrors({ ...fieldErrors, startTime: false });
                                                  }}
                                                  className={cn(
                                                    "px-3 py-2 text-sm font-medium transition-colors hover:bg-muted",
                                                    isSelected ? "bg-[#B08D39] text-white hover:bg-[#9a7b32]" : "text-foreground",
                                                    isPast && "opacity-40 cursor-not-allowed hover:bg-transparent"
                                                  )}
                                                >
                                                  {String(m).padStart(2, "0")}
                                                </button>
                                              );
                                            })}
                                          </div>
                                          <div className="flex flex-col max-h-[220px] overflow-y-auto scrollbar-hide w-12">
                                            {AMPM.map((a) => {
                                              const current = parseTime(formData.startTime);
                                              const isSelected = current.ampm === a;
                                              const isPast = isStartTimeAmPmDisabled(current.hour12, a);
                                              return (
                                                <button
                                                  key={a}
                                                  type="button"
                                                  disabled={isPast}
                                                  onClick={() => {
                                                    if (isPast) return;
                                                    const next = buildTime(current.hour12, current.minute, a);
                                                    setFormData({ ...formData, startTime: next });
                                                    if (fieldErrors.startTime) setFieldErrors({ ...fieldErrors, startTime: false });
                                                  }}
                                                  className={cn(
                                                    "px-2 py-2 text-sm font-medium transition-colors hover:bg-muted",
                                                    isSelected ? "bg-[#B08D39] text-white hover:bg-[#9a7b32]" : "text-foreground",
                                                    isPast && "opacity-40 cursor-not-allowed hover:bg-transparent"
                                                  )}
                                                >
                                                  {a}
                                                </button>
                                              );
                                            })}
                                          </div>
                                        </div>
                                        <p className="text-xs text-muted-foreground px-3 py-2 border-t border-border">Select hour, minute (00/15/30/45), and AM/PM</p>
                                      </PopoverContent>
                                    </Popover>
                                    {fieldErrors.startTime && isStartTimePast && (
                                      <p className="text-sm text-red-500">Cannot select a past time.</p>
                                    )}
                                  </div>
                                  <div className="space-y-2">
                                    <Label htmlFor="endTime" className="text-base font-medium flex items-center gap-2">
                                      <Clock className="h-4 w-4 text-accent" />
                                      End Time *
                                    </Label>
                                    <Popover open={isEndTimeOpen} onOpenChange={setIsEndTimeOpen}>
                                      <PopoverTrigger asChild>
                                        <button
                                          ref={endTimeRef}
                                          type="button"
                                          id="endTime"
                                          className={cn(
                                            "flex h-14 w-full items-center justify-between rounded-md border-2 bg-background px-4 text-left text-base transition-colors hover:border-accent/50 focus:border-accent focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 cursor-pointer",
                                            fieldErrors.endTime && "border-red-500 hover:border-red-600 focus:border-red-600 focus:ring-red-500"
                                          )}
                                        >
                                          <span className={formData.endTime ? "text-foreground" : "text-muted-foreground"}>
                                            {formData.endTime ? formatTime(formData.endTime) : "-- : --"}
                                          </span>
                                          <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
                                        </button>
                                      </PopoverTrigger>
                                      <PopoverContent className="w-auto p-0 shadow-elevated" align="start" sideOffset={4}>
                                        <div className="flex border-b border-border">
                                          <div className="flex flex-col max-h-[220px] overflow-y-auto scrollbar-hide w-14 border-r border-border">
                                            {HOURS_12.map((h) => {
                                              const current = parseTime(formData.endTime);
                                              const isSelected = current.hour12 === h;
                                              return (
                                                <button
                                                  key={h}
                                                  type="button"
                                                  onClick={() => {
                                                    const next = buildTime(h, current.minute, current.ampm);
                                                    setFormData({ ...formData, endTime: next });
                                                    if (fieldErrors.endTime) setFieldErrors({ ...fieldErrors, endTime: false });
                                                  }}
                                                  className={cn(
                                                    "px-3 py-2 text-sm font-medium transition-colors hover:bg-muted",
                                                    isSelected ? "bg-[#B08D39] text-white hover:bg-[#9a7b32]" : "text-foreground"
                                                  )}
                                                >
                                                  {String(h).padStart(2, "0")}
                                                </button>
                                              );
                                            })}
                                          </div>
                                          <div className="flex flex-col max-h-[220px] overflow-y-auto scrollbar-hide w-14 border-r border-border">
                                            {MINUTES_QUARTER.map((m) => {
                                              const current = parseTime(formData.endTime);
                                              const isSelected = current.minute === m;
                                              return (
                                                <button
                                                  key={m}
                                                  type="button"
                                                  onClick={() => {
                                                    const next = buildTime(current.hour12, m, current.ampm);
                                                    setFormData({ ...formData, endTime: next });
                                                    if (fieldErrors.endTime) setFieldErrors({ ...fieldErrors, endTime: false });
                                                  }}
                                                  className={cn(
                                                    "px-3 py-2 text-sm font-medium transition-colors hover:bg-muted",
                                                    isSelected ? "bg-[#B08D39] text-white hover:bg-[#9a7b32]" : "text-foreground"
                                                  )}
                                                >
                                                  {String(m).padStart(2, "0")}
                                                </button>
                                              );
                                            })}
                                          </div>
                                          <div className="flex flex-col max-h-[220px] overflow-y-auto scrollbar-hide w-12">
                                            {AMPM.map((a) => {
                                              const current = parseTime(formData.endTime);
                                              const isSelected = current.ampm === a;
                                              return (
                                                <button
                                                  key={a}
                                                  type="button"
                                                  onClick={() => {
                                                    const next = buildTime(current.hour12, current.minute, a);
                                                    setFormData({ ...formData, endTime: next });
                                                    if (fieldErrors.endTime) setFieldErrors({ ...fieldErrors, endTime: false });
                                                  }}
                                                  className={cn(
                                                    "px-2 py-2 text-sm font-medium transition-colors hover:bg-muted",
                                                    isSelected ? "bg-[#B08D39] text-white hover:bg-[#9a7b32]" : "text-foreground"
                                                  )}
                                                >
                                                  {a}
                                                </button>
                                              );
                                            })}
                                          </div>
                                        </div>
                                        <p className="text-xs text-muted-foreground px-3 py-2 border-t border-border">Select hour, minute (00/15/30/45), and AM/PM</p>
                                      </PopoverContent>
                                    </Popover>
                                  </div>
                                </div>
                              </>
                            )}

                            {/* No layouts available for current filters */}
                            {hasDateTimeSelected && !serviceLayoutsLoading && availableLayouts.length === 0 && (
                              <Alert className={fieldErrors.layoutId ? "border-red-200 bg-red-50 text-red-900" : "border-amber-200 bg-amber-50 text-amber-900"}>
                                <Info className="h-4 w-4" />
                                <AlertDescription>
                                  No layouts available for the selected date, time, and participant count. Try a different time slot or contact us for assistance.
                                </AlertDescription>
                              </Alert>
                            )}
                            {/* Layout — shown when date/time selected; filtered by participants and availability */}
                            {hasDateTimeSelected && (serviceLayoutsLoading || availableLayouts.length > 0) && (
                              <div className="space-y-3">
                                <div className="space-y-1">
                                  <Label className="text-base font-medium">
                                    Layout *
                                  </Label>
                                  {isValidParticipantCount && !participantsExceedMax && participantCount > 0 && (
                                    <p className="text-xs text-muted-foreground">
                                      Showing layouts that fit your group ({participantCount} participant{participantCount !== 1 ? "s" : ""})
                                    </p>
                                  )}
                                </div>
                                <button
                                  ref={layoutRef}
                                  type="button"
                                  onClick={() => !serviceLayoutsLoading && setIsLayoutDialogOpen(true)}
                                  disabled={serviceLayoutsLoading}
                                  className={cn(
                                    "flex h-14 w-full items-center justify-between rounded-md border-2 bg-background px-4 text-left text-base transition-colors hover:border-accent/50 focus:border-accent focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 cursor-pointer",
                                    serviceLayoutsLoading && "cursor-wait opacity-90",
                                    formData.layoutId && "border-accent/30",
                                    fieldErrors.layoutId && "border-red-500 hover:border-red-600 focus:border-red-500"
                                  )}
                                >
                                  <span className={formData.layoutId ? "text-foreground" : "text-muted-foreground"}>
                                    {serviceLayoutsLoading
                                      ? "Loading layouts..."
                                      : formData.layoutId
                                        ? (availableLayouts.find(l => l.id === formData.layoutId)?.name || "Layout selected")
                                        : "Choose layout"}
                                  </span>
                                  {serviceLayoutsLoading ? (
                                    <Loader2 className="h-5 w-5 shrink-0 animate-spin text-accent" />
                                  ) : (
                                    <MapPin className="h-5 w-5 shrink-0 text-accent" />
                                  )}
                                </button>
                                {formData.layoutId && (() => {
                                  const selectedLayout = availableLayouts.find(l => l.id === formData.layoutId);
                                  if (!selectedLayout) return null;
                                  return (
                                    <motion.div
                                      initial={{ opacity: 0, y: -10 }}
                                      animate={{ opacity: 1, y: 0 }}
                                      className="rounded-lg border-2 border-accent/20 bg-accent/5 p-4"
                                    >
                                      <div className="flex gap-4">
                                        {selectedLayout.image && (
                                          <div className="relative w-24 h-24 rounded-md overflow-hidden flex-shrink-0">
                                            <Image
                                              src={selectedLayout.image}
                                              alt={selectedLayout.name}
                                              fill
                                              className="object-cover"
                                              sizes="96px"
                                            />
                                          </div>
                                        )}
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-start justify-between gap-2 mb-1">
                                            <h4 className="font-semibold text-base text-foreground">
                                              {selectedLayout.name}
                                            </h4>
                                            <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
                                          </div>
                                          <div className="flex items-center gap-2 mb-2">
                                            <Badge variant="outline" className="text-xs border-accent/40 bg-background">
                                              <Users className="h-3 w-3 mr-1" />
                                              Capacity: {selectedLayout.capacity} people
                                            </Badge>
                                          </div>
                                          <p className="text-sm text-muted-foreground leading-relaxed">
                                            {selectedLayout.description}
                                          </p>
                                        </div>
                                      </div>
                                    </motion.div>
                                  );
                                })()}
                                {fieldErrors.layoutId && (
                                  <p className="text-xs text-red-600">
                                    Please select a service layout to continue.
                                  </p>
                                )}
                                {roomFallbackMessage && (
                                  <Alert className="border-amber-200 bg-amber-50 text-amber-900 mt-3">
                                    <Info className="h-4 w-4" />
                                    <AlertDescription>
                                      {roomFallbackMessage}
                                    </AlertDescription>
                                  </Alert>
                                )}
                              </div>
                            )}

                          </div>

                          {/* Validation Alerts */}
                          {validationErrors.length > 0 && (
                            <Alert variant="destructive">
                              <Info className="h-4 w-4" />
                              <AlertDescription>
                                {validationErrors[0]}
                              </AlertDescription>
                            </Alert>
                          )}

                          {/* Real-time Availability Status */}
                          {!availabilityStatus.available && availabilityStatus.message && formData.startTime && formData.endTime && validationErrors.length === 0 && (
                            <Alert variant="destructive">
                              <Info className="h-4 w-4" />
                              <AlertDescription>
                                {availabilityStatus.message}
                              </AlertDescription>
                            </Alert>
                          )}

                          {finalAvailability && formData.startTime && formData.endTime && validationErrors.length === 0 && (
                            <>
                              <Alert className="bg-green-50 text-green-900 border-green-200">
                                <CheckCircle2 className="h-4 w-4" />
                                <AlertDescription>
                                  Time slot is available!
                                </AlertDescription>
                              </Alert>
                              {isPerShiftPricing && (
                                <p className="mt-2 text-xs text-muted-foreground">
                                  Pricing for this layout is based on fixed shifts. Each day has two shifts: 12:00&nbsp;AM&nbsp;–&nbsp;12:00&nbsp;PM and 12:00&nbsp;PM&nbsp;–&nbsp;12:00&nbsp;AM. The booking price is calculated per shift, and if your booking uses even 1 hour of the next shift, the full price for that entire shift will be charged.
                                </p>
                              )}
                            </>
                          )}

                          {availabilityLoadFailed && (
                            <Alert className="border-amber-200 bg-amber-50 text-amber-900">
                              <Info className="h-4 w-4" />
                              <AlertDescription>
                                We couldn&apos;t load availability from the server. You can still proceed; we&apos;ll confirm your slot when processing your booking.
                              </AlertDescription>
                            </Alert>
                          )}
                        </div>

                        <div className="flex justify-end pt-6">
                          <Button
                            type="button"
                            onClick={handleNext}
                            variant="gold"
                            size="lg"
                            className="h-14 px-8 text-base font-semibold shadow-gold hover:shadow-elevated transition-all"
                          >
                            Continue to Contact Info
                            <ArrowRight className="ml-2 h-5 w-5" />
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Step 2: Contact Information */}
                    {currentStep === 2 && (
                      <div className="space-y-8 animate-fade-in">
                        <div>
                          <h2 className="heading-card mb-2">
                            Your Information
                          </h2>
                          <p className="text-body mb-6">
                            How should we contact you about this booking?
                          </p>
                        </div>

                        <div className="space-y-6">
                          <div className="grid sm:grid-cols-2 gap-6">
                            <div className="space-y-2">
                              <Label htmlFor="name" className="text-base font-medium">
                                Full Name *
                              </Label>
                              <Input
                                ref={nameRef}
                                id="name"
                                name="name"
                                value={formData.name}
                                onChange={handleChange}
                                required
                                placeholder="Enter your full name"
                                className={cn(
                                  "h-14 text-base border-2 hover:border-accent/50 focus:border-accent transition-colors",
                                  fieldErrors.name && "border-red-500 hover:border-red-600 focus:border-red-600"
                                )}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="company" className="text-base font-medium">
                                Company Name
                              </Label>
                              <Input
                                id="company"
                                name="company"
                                value={formData.company}
                                onChange={handleChange}
                                placeholder="Your company name"
                                className="h-14 text-base border-2 hover:border-accent/50 focus:border-accent transition-colors"
                              />
                            </div>
                          </div>

                          <div className="grid sm:grid-cols-2 gap-6">
                            <div className="space-y-2">
                              <Label htmlFor="email" className="text-base font-medium">
                                Email Address *
                              </Label>
                              <Input
                                ref={emailRef}
                                id="email"
                                name="email"
                                type="email"
                                value={formData.email}
                                onChange={handleChange}
                                required
                                placeholder="admin@gmail.com"
                                className={cn(
                                  "h-14 text-base border-2 hover:border-accent/50 focus:border-accent transition-colors",
                                  fieldErrors.email && "border-red-500 hover:border-red-600 focus:border-red-600"
                                )}
                              />
                              {fieldErrors.email && (
                                <p className="text-xs text-red-600">
                                  {emailErrorMessage ?? "Please enter a valid email address (e.g. admin@gmail.com)."}
                                </p>
                              )}
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="phone" className="text-base font-medium">
                                Phone Number *
                              </Label>
                              <Input
                                ref={phoneRef}
                                id="phone"
                                name="phone"
                                type="tel"
                                inputMode="tel"
                                autoComplete="tel"
                                value={formData.phone}
                                onChange={handleChange}
                                required
                                placeholder="e.g. +1 555 000 0000, +44 20 7123 4567, +91 98765 43210"
                                maxLength={25}
                                className={cn(
                                  "h-14 text-base border-2 hover:border-accent/50 focus:border-accent transition-colors",
                                  fieldErrors.phone && "border-red-500 hover:border-red-600 focus:border-red-600"
                                )}
                              />
                              {fieldErrors.phone && (
                                <p className="text-xs text-red-600">
                                  {phoneErrorMessage ?? "Enter a valid international phone number with country code (e.g. +1, +44, +91)."}
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="message" className="text-base font-medium">
                              Special Requirements
                            </Label>
                            <Textarea
                              id="message"
                              name="message"
                              value={formData.message}
                              onChange={handleChange}
                              placeholder="Tell us about any special requirements or requests for your booking..."
                              rows={5}
                              className="resize-none text-base border-2 hover:border-accent/50 focus:border-accent transition-colors"
                            />
                          </div>

                          {/* Add-Ons & Extras — Food (Breakfast, Lunch), Refreshments (Snacks, Beverages), Equipment, Services */}
                          <div className="space-y-6">
                            <div>
                              <Label className="text-base font-medium">Add-Ons & Extras</Label>
                              <p className="text-sm text-muted-foreground mt-1">
                                {strapiConfigured && addOnsLoading ? (
                                  <span className="inline-flex items-center gap-2">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Loading add-ons...
                                  </span>
                                ) : (
                                  "Choose any extras for your booking. Select multiple options as needed."
                                )}
                              </p>
                            </div>
                            {strapiConfigured && addOnsLoading ? (
                              <div className="flex items-center justify-center py-12 rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/30">
                                <div className="flex flex-col items-center gap-3">
                                  <Loader2 className="h-10 w-10 animate-spin text-accent" />
                                  <p className="text-sm text-muted-foreground">Loading add-ons...</p>
                                </div>
                              </div>
                            ) : (
                            <div className="space-y-6 max-h-[28rem] overflow-y-auto pr-2 custom-scrollbar">
                              {/* Food — Breakfast, Lunch */}
                              {(() => {
                                const foodItems = addOnsList.filter(
                                  (a) => a.category === 'catering' && (a.subcategory === 'breakfast' || a.subcategory === 'lunch')
                                );
                                if (foodItems.length === 0) return null;
                                const breakfast = foodItems.filter((a) => a.subcategory === 'breakfast');
                                const lunch = foodItems.filter((a) => a.subcategory === 'lunch');
                                return (
                                  <div className="space-y-4">
                                    <div className="border-b border-border pb-2">
                                      <h4 className="text-sm font-semibold text-foreground">Food</h4>
                                      <p className="text-xs text-muted-foreground mt-0.5">Breakfast and lunch options</p>
                                    </div>
                                    {breakfast.length > 0 && (
                                      <div className="space-y-2">
                                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Breakfast</p>
                                        <div className="grid gap-3">
                                          {breakfast.map((addOn) => (
                                            <AddOnCard
                                              key={addOn.id}
                                              addOn={addOn}
                                              selected={formData.addOns.includes(addOn.id)}
                                              onToggle={() => handleAddOnToggle(addOn.id)}
                                            />
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                    {lunch.length > 0 && (
                                      <div className="space-y-2">
                                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Lunch</p>
                                        <div className="grid gap-3">
                                          {lunch.map((addOn) => (
                                            <AddOnCard
                                              key={addOn.id}
                                              addOn={addOn}
                                              selected={formData.addOns.includes(addOn.id)}
                                              onToggle={() => handleAddOnToggle(addOn.id)}
                                            />
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}
                              {/* Refreshments — Snacks, Beverages */}
                              {(() => {
                                const refreshmentItems = addOnsList.filter(
                                  (a) => a.category === 'catering' && (a.subcategory === 'snacks' || a.subcategory === 'beverages')
                                );
                                if (refreshmentItems.length === 0) return null;
                                const snacks = refreshmentItems.filter((a) => a.subcategory === 'snacks');
                                const beverages = refreshmentItems.filter((a) => a.subcategory === 'beverages');
                                return (
                                  <div className="space-y-4">
                                    <div className="border-b border-border pb-2">
                                      <h4 className="text-sm font-semibold text-foreground">Refreshments</h4>
                                      <p className="text-xs text-muted-foreground mt-0.5">Snacks and beverages</p>
                                    </div>
                                    {snacks.length > 0 && (
                                      <div className="space-y-2">
                                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Snacks</p>
                                        <div className="grid gap-3">
                                          {snacks.map((addOn) => (
                                            <AddOnCard
                                              key={addOn.id}
                                              addOn={addOn}
                                              selected={formData.addOns.includes(addOn.id)}
                                              onToggle={() => handleAddOnToggle(addOn.id)}
                                            />
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                    {beverages.length > 0 && (
                                      <div className="space-y-2">
                                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Beverages</p>
                                        <div className="grid gap-3">
                                          {beverages.map((addOn) => (
                                            <AddOnCard
                                              key={addOn.id}
                                              addOn={addOn}
                                              selected={formData.addOns.includes(addOn.id)}
                                              onToggle={() => handleAddOnToggle(addOn.id)}
                                            />
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}
                              {/* Equipment */}
                              {(() => {
                                const items = addOnsList.filter((a) => a.category === 'equipment');
                                if (items.length === 0) return null;
                                return (
                                  <div className="space-y-3">
                                    <div className="border-b border-border pb-2">
                                      <h4 className="text-sm font-semibold text-foreground">Equipment</h4>
                                      <p className="text-xs text-muted-foreground mt-0.5">AV and recording options</p>
                                    </div>
                                    <div className="grid gap-3">
                                      {items.map((addOn) => (
                                        <AddOnCard
                                          key={addOn.id}
                                          addOn={addOn}
                                          selected={formData.addOns.includes(addOn.id)}
                                          onToggle={() => handleAddOnToggle(addOn.id)}
                                        />
                                      ))}
                                    </div>
                                  </div>
                                );
                              })()}
                              {/* Services */}
                              {(() => {
                                const items = addOnsList.filter((a) => a.category === 'services');
                                if (items.length === 0) return null;
                                return (
                                  <div className="space-y-3">
                                    <div className="border-b border-border pb-2">
                                      <h4 className="text-sm font-semibold text-foreground">Services</h4>
                                      <p className="text-xs text-muted-foreground mt-0.5">Support and coordination</p>
                                    </div>
                                    <div className="grid gap-3">
                                      {items.map((addOn) => (
                                        <AddOnCard
                                          key={addOn.id}
                                          addOn={addOn}
                                          selected={formData.addOns.includes(addOn.id)}
                                          onToggle={() => handleAddOnToggle(addOn.id)}
                                        />
                                      ))}
                                    </div>
                                  </div>
                                );
                              })()}
                            </div>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-col sm:flex-row item-center sm:flex sm:justify-between pt-6">
                          <Button
                            type="button"
                            onClick={handlePrevious}
                            variant="outline"
                            size="lg"
                            className="h-14 px-8 text-base font-semibold border-2 hover:border-accent hover:text-accent transition-all mb-4 sm:mb-0"
                          >
                            Back
                          </Button>
                          <Button
                            type="button"
                            onClick={handleNext}
                            variant="gold"
                            size="lg"
                            className="h-14 px-8 text-base font-semibold shadow-gold hover:shadow-elevated transition-all"
                          >
                            Review Booking
                            <ArrowRight className="ml-2 h-5 w-5" />
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Step 3: Review & Confirm */}
                    {currentStep === 3 && (
                      <div className="space-y-8 animate-fade-in">
                        <div>
                          <h2 className="heading-card mb-2">
                            Review Your Booking
                          </h2>
                          <p className="text-body mb-6">
                            Please review all details before confirming
                          </p>
                        </div>

                        <div className="space-y-6">
                          {/* Service Details */}
                          <div className="bg-cream rounded-lg p-6 space-y-4">
                            <h3 className="heading-card flex items-center gap-2">
                              <MapPin className="h-5 w-5 text-accent" />
                              Service Details
                            </h3>
                            <div className="grid sm:grid-cols-2 gap-4 text-sm">
                              <div>
                                <p className="text-muted-foreground mb-1">Event Type</p>
                                <p className="font-medium">{selectedEventType?.label ?? selectedService}</p>
                              </div>
                              {formData.guestType && (
                                <div>
                                  <p className="text-muted-foreground mb-1">Guest Type</p>
                                  <p className="font-medium">{formData.guestType}</p>
                                </div>
                              )}
                              {formData.roomSpace && (
                                <div>
                                  <p className="text-muted-foreground mb-1">Selected Space</p>
                                  <p className="font-medium">{roomSpaceLabels[formData.roomSpace] ?? formData.roomSpace}</p>
                                  {isLoungeSelected && (
                                    <Badge variant="outline" className="mt-1.5 text-amber-700 border-amber-300 bg-amber-50 text-xs">
                                      May Require Admin Approval
                                    </Badge>
                                  )}
                                </div>
                              )}
                              {formData.layoutId && (
                                <div>
                                  <p className="text-muted-foreground mb-1">Layout</p>
                                  <p className="font-medium">
                                    {availableLayouts.find(l => l.id === formData.layoutId)?.name || "Layout selected"}
                                  </p>
                                </div>
                              )}
                              {(selectedLayouts.length > 0 || formData.layoutId) && (
                                <div>
                                  <p className="text-muted-foreground mb-1">Layout</p>
                                  <div className="space-y-1">
                                    {selectedLayouts.map((layout) => (
                                      <p key={layout.id} className="font-medium text-sm">
                                        {layout.name}{" "}
                                        <span className="text-muted-foreground">
                                          ({layout.capacity} ppl)
                                        </span>
                                      </p>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {formData.attendees && (
                                <div>
                                  <p className="text-muted-foreground mb-1">Participants</p>
                                  <p className="font-medium">{formData.attendees} people</p>
                                </div>
                              )}
                              {duration > 0 && (
                                <div>
                                  <p className="text-muted-foreground mb-1">Booking Duration</p>
                                  <p className="font-medium">{duration.toFixed(1)} hour{duration !== 1 ? "s" : ""}</p>
                                </div>
                              )}
                              <div>
                                <p className="text-muted-foreground mb-1">{isMultiDay ? "Start Date" : "Date"}</p>
                                <p className="font-medium">{date ? format(date, "PPPP") : ""}</p>
                              </div>
                              {isMultiDay && formData.endDate && (
                                <div>
                                  <p className="text-muted-foreground mb-1">End Date</p>
                                  <p className="font-medium">{format(new Date(formData.endDate), "PPPP")}</p>
                                </div>
                              )}
                              <div>
                                <p className="text-muted-foreground mb-1">Time</p>
                                <p className="font-medium">
                                  {formatTime(formData.startTime)} - {formatTime(formData.endTime)}
                                  {duration > 0 && <span className="text-muted-foreground ml-2">({duration.toFixed(1)}h)</span>}
                                </p>
                              </div>
                            </div>
                          </div>

                          {/* Contact Details */}
                          <div className="bg-cream rounded-lg p-6 space-y-4">
                            <h3 className="heading-card">Contact Information</h3>
                            <div className="grid sm:grid-cols-2 gap-4 text-sm">
                              <div>
                                <p className="text-muted-foreground mb-1">Name</p>
                                <p className="font-medium">{formData.name}</p>
                              </div>
                              {formData.company && (
                                <div>
                                  <p className="text-muted-foreground mb-1">Company</p>
                                  <p className="font-medium">{formData.company}</p>
                                </div>
                              )}
                              <div>
                                <p className="text-muted-foreground mb-1">Email</p>
                                <p className="font-medium">{formData.email}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground mb-1">Phone</p>
                                <p className="font-medium">{formData.phone}</p>
                              </div>
                            </div>
                          </div>

                          {/* Add-ons */}
                          {selectedAddOns.length > 0 && (
                            <div className="bg-cream rounded-lg p-6 space-y-4">
                              <h3 className="heading-card">Selected Add-ons</h3>
                              <div className="space-y-2">
                                {selectedAddOns.map((addOn) => (
                                  <div key={addOn.id} className="flex justify-between items-start text-sm">
                                    <div>
                                      <p className="font-medium">{addOn.name}</p>
                                      <p className="text-xs text-muted-foreground">{addOn.description}</p>
                                    </div>
                                    <Badge variant="outline" className="bg-white">
                                      ${addOn.price}
                                    </Badge>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Special Requirements */}
                          {formData.message && (
                            <div className="bg-cream rounded-lg p-6 space-y-4">
                              <h3 className="heading-card">Special Requirements</h3>
                              <p className="text-body">{formData.message}</p>
                            </div>
                          )}
                        </div>

                        <div className="flex flex-col sm:flex-row sm:flex sm:justify-between pt-6">
                          <Button
                            type="button"
                            onClick={handlePrevious}
                            variant="outline"
                            size="lg"
                            className="h-14 px-8 text-base font-semibold border-2 hover:border-accent hover:text-accent transition-all mb-4 sm:mb-0"
                          >
                            Back
                          </Button>
                          <Button
                            type="submit"
                            variant="gold"
                            size="lg"
                            disabled={isSubmitting}
                            className="h-14 px-10 text-base font-semibold shadow-gold hover:shadow-elevated transition-all"
                          >
                            {isSubmitting ? "Processing…" : "Confirm Booking"}
                            <CheckCircle2 className="ml-2 h-5 w-5" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </form>
                </CardContent>
              </Card>
            </motion.div>

            {/* Sidebar Summary */}
            <motion.div
              className="lg:col-span-1"
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: false, amount: 0.15 }}
              transition={{ duration: 0.5 }}
            >
              <div className="sticky top-40 space-y-6">
                {/* Price Summary */}
                <Card className="shadow-premium">
                  <CardHeader>
                    <CardTitle className="heading-card flex items-center gap-2">
                      <DollarSign className="h-5 w-5 text-accent" />
                      Booking Summary
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {formData.serviceType && duration > 0 && formData.layoutId ? (
                      <>
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Itemized receipt</p>

                        {/* Selected Space, Layout (if applicable), Participants, Booking Duration — placeholders */}
                        {(formData.layoutId || formData.roomSpace || formData.attendees || duration > 0) && (
                          <div className="space-y-1.5 text-sm">
                            {formData.roomSpace && (
                              <div className="flex justify-between items-baseline">
                                <span className="text-muted-foreground">Selected Space</span>
                                <span className="font-medium">{roomSpaceLabels[formData.roomSpace] ?? formData.roomSpace}</span>
                              </div>
                            )}
                            {formData.layoutId && (
                              <div className="flex justify-between items-baseline">
                                <span className="text-muted-foreground">Layout</span>
                                <span className="font-medium text-right">
                                  {availableLayouts.find(l => l.id === formData.layoutId)?.name || "Layout selected"}
                                </span>
                              </div>
                            )}
                            {formData.attendees && (
                              <div className="flex justify-between items-baseline">
                                <span className="text-muted-foreground">Participants</span>
                                <span className="font-medium">{formData.attendees} people</span>
                              </div>
                            )}
                            {duration > 0 && (
                              <div className="flex justify-between items-baseline">
                                <span className="text-muted-foreground">Booking Duration</span>
                                <span className="font-medium">{duration.toFixed(1)} hour{duration !== 1 ? "s" : ""}</span>
                              </div>
                            )}
                            {isLoungeSelected && (
                              <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50 text-xs w-full justify-center mt-1">
                                May Require Admin Approval
                              </Badge>
                            )}
                          </div>
                        )}

                        {/* Service summary — main venue/duration */}
                        <div className="space-y-1">
                          <p className="text-xs font-semibold text-foreground">Venue & duration</p>
                          <div className="flex justify-between items-baseline text-sm">
                            <span className="text-foreground pr-2">
                              {selectedService}
                              {/*<span className="text-muted-foreground font-normal ml-1">*/}
                                {/*({duration.toFixed(2)} hrs{duration !== 1 ? "s" : ""} × ${serviceRatePerHour.toFixed(0)}/hr)*/}
                              {/*</span>*/}
                            </span>
                            <span className="font-medium whitespace-nowrap">
                              ${serviceCost.toFixed(2)}
                            </span>
                          </div>
                        </div>

                        {/* Add-Ons by category with subtotals — Food (Breakfast, Lunch), Refreshments (Snacks, Beverages), Equipment, Services */}
                        {selectedAddOns.length > 0 && (
                          <>
                            {(() => {
                              const foodItems = selectedAddOns.filter(
                                (a) => a.category === 'catering' && (a.subcategory === 'breakfast' || a.subcategory === 'lunch')
                              );
                              if (foodItems.length > 0) {
                                const subtotal = foodItems.reduce((s, a) => s + a.price, 0);
                                return (
                                  <div key="food" className="space-y-1.5">
                                    <p className="text-xs font-semibold text-foreground">Food</p>
                                    {foodItems.map((addOn) => (
                                      <div key={addOn.id} className="flex justify-between text-sm pl-1">
                                        <span className="text-muted-foreground pr-2">{addOn.name}</span>
                                        <span className="font-medium whitespace-nowrap">${addOn.price}</span>
                                      </div>
                                    ))}
                                    <div className="flex justify-between text-sm pl-1 border-t border-border/60 pt-1">
                                      <span className="text-muted-foreground italic">Subtotal</span>
                                      <span className="font-medium whitespace-nowrap">${subtotal}</span>
                                    </div>
                                  </div>
                                );
                              }
                              return null;
                            })()}
                            {(() => {
                              const refreshmentItems = selectedAddOns.filter(
                                (a) => a.category === 'catering' && (a.subcategory === 'snacks' || a.subcategory === 'beverages')
                              );
                              if (refreshmentItems.length > 0) {
                                const subtotal = refreshmentItems.reduce((s, a) => s + a.price, 0);
                                return (
                                  <div key="refreshments" className="space-y-1.5">
                                    <p className="text-xs font-semibold text-foreground">Refreshments</p>
                                    {refreshmentItems.map((addOn) => (
                                      <div key={addOn.id} className="flex justify-between text-sm pl-1">
                                        <span className="text-muted-foreground pr-2">{addOn.name}</span>
                                        <span className="font-medium whitespace-nowrap">${addOn.price}</span>
                                      </div>
                                    ))}
                                    <div className="flex justify-between text-sm pl-1 border-t border-border/60 pt-1">
                                      <span className="text-muted-foreground italic">Subtotal</span>
                                      <span className="font-medium whitespace-nowrap">${subtotal}</span>
                                    </div>
                                  </div>
                                );
                              }
                              return null;
                            })()}
                            {(
                              [
                                { key: "equipment" as const, label: "Equipment" },
                                { key: "services" as const, label: "Services" },
                              ] as const
                            ).map(({ key, label }) => {
                              const items = selectedAddOns.filter((a) => a.category === key);
                              if (items.length === 0) return null;
                              const subtotal = items.reduce((s, a) => s + a.price, 0);
                              return (
                                <div key={key} className="space-y-1.5">
                                  <p className="text-xs font-semibold text-foreground">{label}</p>
                                  {items.map((addOn) => (
                                    <div key={addOn.id} className="flex justify-between text-sm pl-1">
                                      <span className="text-muted-foreground pr-2">{addOn.name}</span>
                                      <span className="font-medium whitespace-nowrap">${addOn.price}</span>
                                    </div>
                                  ))}
                                  <div className="flex justify-between text-sm pl-1 border-t border-border/60 pt-1">
                                    <span className="text-muted-foreground italic">Subtotal</span>
                                    <span className="font-medium whitespace-nowrap">${subtotal}</span>
                                  </div>
                                </div>
                              );
                            })}
                          </>
                        )}

                        <Separator />

                        {/* Grand total */}
                        <div className="flex justify-between items-baseline">
                          <span className="font-heading font-semibold text-lg">Grand total</span>
                          <div className="text-right">
                            <p className="font-heading font-bold text-2xl text-accent">
                              ${totalPrice.toFixed(2)}
                            </p>
                            {effectiveUnitCount > 0 && (
                              <p className="text-xs text-muted-foreground">
                                ${(totalPrice / effectiveUnitCount).toFixed(2)}/{pricingUnit}
                              </p>
                            )}
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground text-sm">
                        <DollarSign className="h-12 w-12 mx-auto mb-3 opacity-20" />
                        <p>Select booking details to see pricing</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Help Card */}
                <Card className="bg-gradient-gold text-white border-0">
                  <CardHeader>
                    <CardTitle className="heading-card text-white">{bookPageData?.helpCard?.title || "Need Assistance?"}</CardTitle>
                    <CardDescription className="text-body text-white/90">
                      {bookPageData?.helpCard?.description || "Our team is here to help"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <p>Call us: {bookPageData?.helpCard?.phoneNumber || "(123) 456-7890"}</p>
                    <p>Email: {bookPageData?.helpCard?.email || "bookings@visionaryhouse.com"}</p>
                    <Button variant="outline" asChild>
                      <a href={bookPageData?.helpCard?.ctaHref || "/contact"}>{bookPageData?.helpCard?.ctaLabel || "Contact Support"}</a>
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 bg-white">
        <div className="container-premium">
          <motion.div
            className="grid md:grid-cols-3 gap-8"
            initial="initial"
            whileInView="animate"
            viewport={{ once: false, amount: 0.2 }}
            variants={{
              animate: {
                transition: {
                  staggerChildren: 0.1
                }
              }
            }}
          >
            {bookPageFeatures.map((item, index) => {
              const IconComponent = FEATURE_ICONS[index % FEATURE_ICONS.length];
              return (
                <motion.div
                  key={item.title || index}
                  className="text-center !opacity-100"
                  variants={{
                    initial: { opacity: 0, y: 20 },
                    animate: { opacity: 1, y: 0, transition: { duration: 0.6 } }
                  }}
                >
                  <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-accent/10 text-accent mb-4">
                    <IconComponent className="h-7 w-7" />
                  </div>
                  <h3 className="heading-card mb-2">
                    {item.title}
                  </h3>
                  <p className="text-small">
                    {item.description}
                  </p>
                </motion.div>
              );
            })}
          </motion.div>
        </div>
      </section>
    </main>
    </Layout>
  );
}
