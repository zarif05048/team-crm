/** Only verified numbers are shown. wa_id may be a WhatsApp privacy ID. */
export function contactPhone(contact: { phone_number?: string | null }): string {
  const phone = contact.phone_number;
  return phone && /^\d{7,15}$/.test(phone) ? `+${phone}` : "Phone number unavailable";
}

export function contactName(contact: {
  name?: string | null;
  profile_name?: string | null;
  phone_number?: string | null;
}): string {
  return contact.name || contact.profile_name ||
    (contact.phone_number ? contactPhone(contact) : "WhatsApp contact");
}
