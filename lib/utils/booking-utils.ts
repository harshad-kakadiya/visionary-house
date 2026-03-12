import { Booking, AvailabilityCheck, AvailabilityResult, BookingConfig } from '@/lib/types/booking';
import { bookingConfig } from '@/lib/data/booking-config';

/**
 * Generate a unique booking reference number
 * Format: VH-YYYYMMDD-XXXX (e.g., VH-20260122-A1B2)
 */
export function generateBookingReference(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  
  // Generate random alphanumeric code
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  return `VH-${year}${month}${day}-${code}`;
}

/**
 * Convert time string (HH:mm) to minutes since midnight
 */
export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * Convert minutes since midnight to time string (HH:mm)
 */
export function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

/**
 * Check if two time ranges overlap with buffer consideration
 */
export function timesOverlap(
  start1: string,
  end1: string,
  start2: string,
  end2: string,
  bufferMinutes: number = bookingConfig.bufferMinutes
): boolean {
  const start1Minutes = timeToMinutes(start1);
  const end1Minutes = timeToMinutes(end1);
  const start2Minutes = timeToMinutes(start2);
  const end2Minutes = timeToMinutes(end2);
  
  // Add buffer to both ranges
  const bufferedStart1 = start1Minutes - bufferMinutes;
  const bufferedEnd1 = end1Minutes + bufferMinutes;
  const bufferedStart2 = start2Minutes - bufferMinutes;
  const bufferedEnd2 = end2Minutes + bufferMinutes;
  
  // Check for overlap
  return bufferedStart1 < bufferedEnd2 && bufferedStart2 < bufferedEnd1;
}

/**
 * Check if a date is within business hours
 */
export function isWithinBusinessHours(
  startTime: string,
  endTime: string,
  config: BookingConfig = bookingConfig
): boolean {
  const startMinutes = timeToMinutes(startTime);
  const endMinutes = timeToMinutes(endTime);
  const businessStart = timeToMinutes(config.businessHours.start);
  const businessEnd = timeToMinutes(config.businessHours.end);
  
  return startMinutes >= businessStart && endMinutes <= businessEnd;
}

/**
 * Check if booking duration is within limits
 */
export function isValidDuration(
  startTime: string,
  endTime: string,
  config: BookingConfig = bookingConfig
): { valid: boolean; message?: string } {
  const duration = timeToMinutes(endTime) - timeToMinutes(startTime);
  
  if (duration < config.minBookingDuration) {
    return {
      valid: false,
      message: `Minimum booking duration is ${config.minBookingDuration} minutes`,
    };
  }
  
  if (duration > config.maxBookingDuration) {
    return {
      valid: false,
      message: `Maximum booking duration is ${config.maxBookingDuration} minutes`,
    };
  }
  
  return { valid: true };
}

/**
 * Total duration in minutes from start date+time to end date+time (supports multi-day).
 * If endDate is omitted or same as start date, uses startTime and endTime only.
 */
export function getTotalDurationMinutes(
  startDate: string,
  startTime: string,
  endDate: string | undefined,
  endTime: string
): number {
  const start = new Date(`${startDate}T${startTime}:00`);
  const end = endDate
    ? new Date(`${endDate}T${endTime}:00`)
    : new Date(`${startDate}T${endTime}:00`);
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
}

/**
 * Count how many 12‑hour shifts a booking touches.
 * Shifts are:
 * - Shift 1: 00:00 → 12:00
 * - Shift 2: 12:00 → 24:00
 * Any overlap with a shift counts as 1 full shift.
 */
export function countShiftsInRange(
  startDate: string,
  startTime: string,
  endDate: string | undefined,
  endTime: string
): number {
  const start = new Date(`${startDate}T${startTime}:00`);
  const end = endDate
    ? new Date(`${endDate}T${endTime}:00`)
    : new Date(`${startDate}T${endTime}:00`);

  if (!(end.getTime() > start.getTime())) {
    return 0;
  }

  // Anchor at midnight of the start date, then slice time into 12h buckets
  const anchor = new Date(start);
  anchor.setHours(0, 0, 0, 0);
  const shiftMs = 12 * 60 * 60 * 1000;

  const startIndex = Math.floor((start.getTime() - anchor.getTime()) / shiftMs);
  // Subtract 1ms so bookings ending exactly on a boundary
  // (e.g. 10:00–12:00) are counted in the correct shift only.
  const endIndex = Math.floor(((end.getTime() - 1) - anchor.getTime()) / shiftMs);

  return Math.max(0, endIndex - startIndex + 1);
}

/**
 * Check if date is blocked
 */
export function isDateBlocked(
  date: string,
  config: BookingConfig = bookingConfig
): boolean {
  return config.blockedDates.includes(date);
}

/**
 * Check if date is within advance booking window
 */
export function isWithinBookingWindow(
  date: string,
  config: BookingConfig = bookingConfig
): boolean {
  const bookingDate = new Date(date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const maxDate = new Date(today);
  maxDate.setDate(maxDate.getDate() + config.advanceBookingDays);
  
  return bookingDate >= today && bookingDate <= maxDate;
}

/**
 * Check availability for a specific booking slot
 */
export function checkAvailability(
  check: AvailabilityCheck,
  existingBookings: Booking[]
): AvailabilityResult {
  // Validate business hours
  if (!isWithinBusinessHours(check.startTime, check.endTime)) {
    return {
      available: false,
      message: `Bookings must be within business hours (${bookingConfig.businessHours.start} - ${bookingConfig.businessHours.end})`,
    };
  }
  
  // Validate duration
  const durationCheck = isValidDuration(check.startTime, check.endTime);
  if (!durationCheck.valid) {
    return {
      available: false,
      message: durationCheck.message,
    };
  }
  
  // Check if date is blocked
  if (isDateBlocked(check.date)) {
    return {
      available: false,
      message: 'This date is not available for bookings',
    };
  }
  
  // Check if within booking window
  if (!isWithinBookingWindow(check.date)) {
    return {
      available: false,
      message: `Bookings can only be made up to ${bookingConfig.advanceBookingDays} days in advance`,
    };
  }
  
  // Find conflicts with existing bookings
  const conflicts = existingBookings.filter((booking) => {
    // Only check confirmed bookings for the same service and date
    if (
      booking.status !== 'confirmed' ||
      booking.serviceType !== check.serviceType ||
      booking.date !== check.date
    ) {
      return false;
    }
    
    // Check for time overlap with buffer
    return timesOverlap(
      check.startTime,
      check.endTime,
      booking.startTime,
      booking.endTime
    );
  });
  
  if (conflicts.length > 0) {
    return {
      available: false,
      conflicts,
      message: 'This time slot conflicts with existing bookings',
    };
  }
  
  return {
    available: true,
    message: 'Time slot is available',
  };
}

/**
 * Calculate total price for booking with add-ons.
 * Pricing is driven by Room/Space:
 * - If roomRate is provided:
 *   - pricingType "Per Hour": price = roomRate * hours
 *   - pricingType "Per Shift": price = roomRate * numberOfShifts
 * - If roomRate is missing, falls back to built-in base prices per serviceType (legacy behaviour).
 */
export function calculateBookingPrice(
  serviceType: string,
  duration: number,
  addOnIds: string[],
  addOnsData: any[],
  roomRate?: number | null,
  roomPricingType?: string | null,
  shiftCount?: number
): number {
  const basePrices: Record<string, number> = {
    'event-space': 200,
    'lounge': 100,
    'virtual-office': 50,
    'media-studio': 150,
  };
  const hours = duration / 60;
  let serviceCost = 0;

  if (roomRate != null && Number.isFinite(Number(roomRate))) {
    const r = Number(roomRate);
    const type = (roomPricingType || '').toLowerCase();
    if (type.includes('shift')) {
      const effectiveShiftCount = shiftCount && shiftCount > 0 ? shiftCount : 1;
      serviceCost = r * effectiveShiftCount;
    } else {
      serviceCost = r * hours;
    }
  } else {
    const basePrice = basePrices[serviceType] ?? 0;
    serviceCost = basePrice * hours;
  }

  const addOnsCost = addOnIds.reduce((total, addOnId) => {
    const addOn = addOnsData.find((a) => a.id === addOnId);
    return total + (addOn?.price || 0);
  }, 0);

  return serviceCost + addOnsCost;
}

/**
 * Format date for display
 */
export function formatBookingDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Format time for display
 */
export function formatTime(time: string): string {
  const [hours, minutes] = time.split(':');
  const hour = parseInt(hours);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minutes} ${ampm}`;
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate phone format
 */
export function isValidPhone(phone: string): boolean {
  const phoneRegex = /^[\d\s\-\+\(\)]+$/;
  return phoneRegex.test(phone) && phone.replace(/\D/g, '').length >= 10;
}



