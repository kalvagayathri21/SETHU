export function getBookingRequestBlockReason(providerProfile, service, customerRole) {
  if (providerProfile?.is_sample) {
    return "Sample providers do not accept booking requests.";
  }
  if (!Number.isInteger(Number(providerProfile?.provider_id)) ||
      Number(providerProfile.provider_id) <= 0 ||
      !Number.isInteger(Number(service?.serviceId)) ||
      Number(service.serviceId) <= 0) {
    return "This service is not available for booking.";
  }
  if (!customerRole) {
    return "Sign in with a customer account to request this service.";
  }
  if (customerRole !== "CUSTOMER") return "Use a customer account to request this service.";
  return "";
}
