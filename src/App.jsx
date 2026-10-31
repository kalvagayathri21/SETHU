
import React, { useEffect, useMemo, useState } from "react";
import { apiRequest, getApiErrorMessage } from "./api.js";
import { sampleProviders as sampleProviderData, sampleServiceCategories } from "./sampleProviders.js";
import { getBookingRequestBlockReason } from "./providerBooking.js";
import AdminDashboard from "./AdminDashboard.jsx";
import {
  Search, MapPin, Menu, X, ArrowRight, ShieldCheck, Clock3, Star,
  Wrench, Zap, CarFront, Sparkles, Snowflake, Scissors, Home,
  ChevronRight, SlidersHorizontal, Heart, CalendarDays, Eye, EyeOff,
  LockKeyhole, Mail, ArrowLeft, UserRound, Phone, Briefcase,
  LayoutDashboard, Compass, ClipboardList, MessageCircle, LogOut,
  Settings, Pencil, Check, Plus, Trash2, Building2, Users, Upload
} from "lucide-react";

const categories = [
  { name: "Home repairs", icon: Wrench, tone: "lavender" },
  { name: "Electricians", icon: Zap, tone: "peach" },
  { name: "Vehicle care", icon: CarFront, tone: "blue" },
  { name: "Cleaning", icon: Sparkles, tone: "mint" },
  { name: "AC services", icon: Snowflake, tone: "sky" },
  { name: "Beauty & wellness", icon: Scissors, tone: "pink" }
];

const providers = [
  {
    name: "Ramesh Kumar",
    role: "Plumbing specialist",
    category: "Home repairs",
    rating: "4.9",
    reviews: 128,
    price: "₹300 onwards",
    area: "Madhapur",
    image: "https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=700&q=85",
    verified: true
  },
  {
    name: "Arjun Electricals",
    role: "Electrical services",
    category: "Electricians",
    rating: "4.8",
    reviews: 96,
    price: "₹350 onwards",
    area: "Kondapur",
    image: "https://images.unsplash.com/photo-1621905252507-b35492cc74b4?w=700&q=85",
    verified: true
  },
  {
    name: "CityCare Auto",
    role: "Car & bike service",
    category: "Vehicle care",
    rating: "4.7",
    reviews: 74,
    price: "₹500 onwards",
    area: "Gachibowli",
    image: "https://images.unsplash.com/photo-1486262715619-67b85e0b08d3?w=700&q=85",
    verified: true
  },
  {
    name: "FreshNest Services",
    role: "Home cleaning",
    category: "Cleaning",
    rating: "4.9",
    reviews: 112,
    price: "₹250 onwards",
    area: "Miyapur",
    image: "https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=700&q=85",
    verified: true
  }
];

const dashboardCategories = [
  { name: "Plumbing", icon: Wrench, tone: "lavender" },
  { name: "Electrical", icon: Zap, tone: "peach" },
  { name: "AC Repair", icon: Snowflake, tone: "sky" },
  { name: "Cleaning", icon: Sparkles, tone: "mint" },
  { name: "Appliance Repair", icon: Settings, tone: "blue" },
  { name: "Vehicle Services", icon: CarFront, tone: "peach" },
  { name: "Beauty & Wellness", icon: Scissors, tone: "pink" },
  { name: "Home Repairs", icon: Home, tone: "lavender" }
];

const categoryLabels = new Map(sampleServiceCategories.map(({ slug, label }) => [slug, label]));
const categorySlugs = new Map(sampleServiceCategories.map(({ slug, label }) => [label, slug]));
const sampleDashboardProviders = sampleProviderData.map((provider) => {
  const displayName = provider.businessName || provider.name;
  return {
    name: displayName,
    category: categoryLabels.get(provider.categorySlug),
    categorySlug: provider.categorySlug,
    description: provider.description,
    experienceYears: provider.experienceYears,
    providerType: provider.providerType,
    serviceName: provider.serviceName,
    serviceDescription: provider.serviceDescription,
    location: `${provider.locality}, ${provider.city}`,
    pin: provider.pinCode,
    rating: provider.rating.toFixed(1),
    reviews: 1,
    price: provider.priceType === "RANGE"
      ? `₹${provider.priceMin}–₹${provider.priceMax}`
      : `₹${provider.priceMin} onwards`,
    initials: displayName.split(" ").map((part) => part[0]).join("").slice(0, 2),
    tone: dashboardCategories.find((category) => category.name === categoryLabels.get(provider.categorySlug))?.tone || "lavender",
    isSample: true,
    sampleKey: provider.key,
    areas: [{ city: provider.city, locality: provider.locality, pinCode: provider.pinCode }]
  };
});

const sampleRequests = [
  { id: "STH-2048", service: "Kitchen sink repair", provider: "Ramesh Kumar", date: "Oct 28, 2026", status: "Pending" },
  { id: "STH-2039", service: "Ceiling fan installation", provider: "Arjun Electricals", date: "Oct 25, 2026", status: "Accepted" },
  { id: "STH-2016", service: "AC maintenance", provider: "CoolBreeze Services", date: "Oct 22, 2026", status: "In Progress" },
  { id: "STH-1984", service: "Full home cleaning", provider: "FreshNest Services", date: "Oct 18, 2026", status: "Completed" },
  { id: "STH-1950", service: "Washing machine check", provider: "FixRight Appliances", date: "Oct 14, 2026", status: "Rejected" },
  { id: "STH-1922", service: "Car wash and detailing", provider: "CityCare Auto", date: "Oct 10, 2026", status: "Cancelled" }
];

function getPageFromPath(pathname) {
  if (pathname === "/login") return "login";
  if (pathname === "/register") return "register";
  if (/^\/provider-profile\/[^/]+$/.test(pathname)) return "provider-profile";
  if (pathname === "/customer-dashboard") return "customer-dashboard";
  if (pathname === "/provider-dashboard") return "provider-dashboard";
  if (pathname === "/business-dashboard") return "business-dashboard";
  if (pathname === "/admin-dashboard") return "admin-dashboard";
  return "home";
}

function getProviderProfileKey(pathname) {
  return pathname.match(/^\/provider-profile\/([^/]+)$/)?.[1] || "";
}

function AuthPage({ page, onNavigate }) {
  const isLogin = page === "login";
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [status, setStatus] = useState({ type: "", message: "" });
  const [accountType, setAccountType] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function showMessage(type, message) {
    setStatus({ type, message });
  }

  async function handleLogin(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;

    const email = form.elements.email.value.trim();
    const password = form.elements.password.value;
    if (!email || !password) {
      showMessage("error", "Enter your email address and password.");
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await apiRequest("/auth/login", { method: "POST", body: { email, password } });
      const routeByRole = {
        CUSTOMER: "/customer-dashboard",
        INDIVIDUAL_PROVIDER: "/provider-dashboard",
        BUSINESS_PROVIDER: "/business-dashboard",
        ADMIN: "/admin-dashboard"
      };
      onNavigate(routeByRole[data.user.role] || "/");
    } catch (error) {
      showMessage("error", getApiErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRegistration(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;

    if (accountType !== "customer") {
      const selectedCategories = form.querySelectorAll(
        'input[name="serviceCategories"]:checked'
      );
      if (selectedCategories.length === 0) {
        showMessage("error", "Select at least one service category.");
        form.querySelector(".service-category-options")?.focus();
        return;
      }
    }

    const password = form.elements.password.value;
    const confirmPassword = form.elements.confirmPassword.value;
    if (password.length < 8) {
      showMessage("error", "Choose a password with at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      showMessage("error", "The passwords do not match. Please check and try again.");
      return;
    }

    const formData = new FormData(form);
    const roleByAccountType = {
      customer: "CUSTOMER",
      "individual-provider": "INDIVIDUAL_PROVIDER",
      "business-provider": "BUSINESS_PROVIDER"
    };
    const city = String(formData.get("city") || "");
    const pinCode = String(formData.get("pinCode") || "");
    const serviceAreas = String(formData.get("serviceAreas") || "")
      .split(",").map((area) => area.trim()).filter(Boolean);
    if (accountType !== "customer" && (!city || !pinCode || !serviceAreas.length)) {
      showMessage("error", "Enter your service city, PIN code and at least one locality.");
      return;
    }
    const payload = {
      role: roleByAccountType[accountType],
      name: accountType === "business-provider"
        ? String(formData.get("contactPerson") || "")
        : String(formData.get("fullName") || ""),
      businessName: String(formData.get("businessName") || ""),
      email: String(formData.get("email") || ""),
      phone: String(formData.get("phone") || ""),
      password,
      experienceYears: Number(formData.get("experience") || 0),
      description: "",
      address: String(formData.get("businessAddress") || ""),
      city,
      locality: serviceAreas[0] || "",
      pinCode,
      categories: [...form.querySelectorAll('input[name="serviceCategories"]:checked')].map((input) => input.value),
      serviceAreas: serviceAreas.map((locality) => ({ city, locality, pinCode }))
    };
    setSubmitting(true);
    try {
      const { data } = await apiRequest("/auth/register", { method: "POST", body: payload });
      showMessage("success", "Your account has been created. Provider profiles require admin approval before receiving requests.");
      const destination = {
        CUSTOMER: "/customer-dashboard",
        INDIVIDUAL_PROVIDER: "/provider-dashboard",
        BUSINESS_PROVIDER: "/business-dashboard"
      }[data.user.role];
      window.setTimeout(() => onNavigate(destination || "/"), 650);
    } catch (error) {
      showMessage("error", getApiErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-shell">
      <header className="auth-topbar">
        <a
          className="brand"
          href="/"
          onClick={(event) => {
            event.preventDefault();
            onNavigate("/");
          }}
          aria-label="SETHU home"
        >
          <span className="brand-mark">S</span>
          <span>SETHU<span className="brand-dot">.</span></span>
        </a>
        <a
          className="auth-home-link"
          href="/"
          onClick={(event) => {
            event.preventDefault();
            onNavigate("/");
          }}
        >
          <ArrowLeft size={16} /> Back to Home
        </a>
      </header>

      <div className={`auth-layout ${isLogin ? "login-layout" : "register-layout"}`}>
        <section className="auth-intro">
          <div className="auth-intro-content">
            <span className="auth-kicker">LOCAL HELP, ONE CONNECTION AWAY</span>
            <h1>{isLogin ? <>Welcome<br /><span>back.</span></> : <>Find trusted local <span>services with SETHU.</span></>}</h1>
            <p>
              {isLogin
                ? "Your local services, requests and trusted professionals are just around the corner."
                : "Join a community connecting everyday needs with trusted local services."}
            </p>
            <div className="auth-intro-note">
              <ShieldCheck size={19} />
              <span>Simple, local service connections</span>
            </div>
          </div>
          <div className="auth-decoration auth-decoration-one" />
          <div className="auth-decoration auth-decoration-two" />
        </section>

        <section className="auth-form-panel">
          <div className="auth-form-heading">
            <span className="auth-form-eyebrow">{isLogin ? "GOOD TO SEE YOU" : "GET STARTED FOR FREE"}</span>
            <h2>{isLogin ? "Log in to SETHU" : "Create your account"}</h2>
            <p>
              {isLogin
                ? "Enter your details to continue."
                : "Tell us a little about yourself to get started."}
            </p>
          </div>

          {status.message && (
            <div className={`auth-message ${status.type}`} role={status.type === "error" ? "alert" : "status"}>
              {status.message}
            </div>
          )}

          {isLogin ? (
            <form className="auth-form" onSubmit={handleLogin}>
              <label className="auth-field">
                <span>Email address</span>
                <span className="auth-input-wrap">
                  <Mail size={17} />
                  <input
                    type="email"
                    name="email"
                    placeholder="you@example.com"
                    autoComplete="email"
                    required
                  />
                </span>
              </label>

              <label className="auth-field">
                <span>Password</span>
                <span className="auth-input-wrap">
                  <LockKeyhole size={17} />
                  <input
                    type={showPassword ? "text" : "password"}
                    name="password"
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    required
                  />
                  <button
                    className="password-toggle"
                    type="button"
                    onClick={() => setShowPassword((visible) => !visible)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </span>
              </label>

              <div className="auth-options">
                <label className="remember-option">
                  <input type="checkbox" name="remember" />
                  <span>Remember me</span>
                </label>
                <button
                  className="auth-text-button"
                  type="button"
                  onClick={() =>
                    showMessage("info", "Password recovery is not available in this frontend prototype.")
                  }
                >
                  Forgot password?
                </button>
              </div>

              <button className="primary-btn auth-submit" type="submit" disabled={submitting}>
                {submitting ? "Signing in..." : "Log in"} <ArrowRight size={17} />
              </button>
            </form>
          ) : (
            <form className="auth-form register-form" onSubmit={handleRegistration}>
              <label className="auth-field">
                <span>Account type</span>
                <select
                  className="auth-select"
                  name="accountType"
                  value={accountType}
                  onChange={(event) => {
                    setAccountType(event.target.value);
                    setStatus({ type: "", message: "" });
                  }}
                  required
                >
                  <option value="" disabled>Select your account type</option>
                  <option value="customer">Customer</option>
                  <option value="individual-provider">Individual Service Provider</option>
                  <option value="business-provider">Business Provider</option>
                </select>
              </label>

              {accountType === "business-provider" ? (
                <>
                  <label className="auth-field">
                    <span>Business name</span>
                    <span className="auth-input-wrap">
                      <Briefcase size={17} />
                      <input
                        type="text"
                        name="businessName"
                        placeholder="Your business name"
                        autoComplete="organization"
                        minLength="2"
                        required
                      />
                    </span>
                  </label>
                  <label className="auth-field">
                    <span>Owner / contact person</span>
                    <span className="auth-input-wrap">
                      <UserRound size={17} />
                      <input
                        type="text"
                        name="contactPerson"
                        placeholder="Full name of contact person"
                        autoComplete="name"
                        minLength="2"
                        required
                      />
                    </span>
                  </label>
                </>
              ) : accountType ? (
                <label className="auth-field">
                  <span>Full name</span>
                  <span className="auth-input-wrap">
                    <UserRound size={17} />
                    <input
                      type="text"
                      name="fullName"
                      placeholder="Your full name"
                      autoComplete="name"
                      minLength="2"
                      required
                    />
                  </span>
                </label>
              ) : null}

              {accountType && (
                <div className="auth-field-row">
                  <label className="auth-field">
                    <span>Email address</span>
                    <span className="auth-input-wrap">
                      <Mail size={17} />
                      <input
                        type="email"
                        name="email"
                        placeholder="you@example.com"
                        autoComplete="email"
                        required
                      />
                    </span>
                  </label>

                  <label className="auth-field">
                    <span>Phone number</span>
                    <span className="auth-input-wrap">
                      <Phone size={17} />
                      <input
                        type="tel"
                        name="phone"
                        placeholder="+919876543210"
                        autoComplete="tel"
                        pattern="[+]?[0-9]{7,15}"
                        title="Enter 7 to 15 digits, with an optional leading +."
                        required
                      />
                    </span>
                  </label>
                </div>
              )}

              {accountType === "individual-provider" && (
                <>
                  <fieldset className="auth-field service-category-field">
                    <legend>Service categories <span>(select all that apply)</span></legend>
                    <div className="service-category-options" tabIndex="-1">
                      {categories.map(({ name }) => (
                        <label className="service-category-option" key={name}>
                          <input type="checkbox" name="serviceCategories" value={name} />
                          <span>{name}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <label className="auth-field">
                    <span>Experience</span>
                    <span className="auth-input-wrap">
                      <input
                        className="auth-input-plain"
                        type="number"
                        name="experience"
                        placeholder="Years of experience"
                        min="0"
                        max="80"
                        required
                      />
                      <span className="auth-input-suffix">years</span>
                    </span>
                  </label>
                  <label className="auth-field">
                    <span>Service areas / localities</span>
                    <textarea
                      className="auth-textarea"
                      name="serviceAreas"
                      placeholder="List the areas or localities you serve"
                      rows="2"
                      minLength="2"
                      required
                    />
                  </label>
                  <div className="auth-field-row">
                    <label className="auth-field"><span>City</span><span className="auth-input-wrap"><input name="city" placeholder="Hyderabad" minLength="2" required /></span></label>
                    <label className="auth-field"><span>PIN code</span><span className="auth-input-wrap"><input name="pinCode" inputMode="numeric" pattern="[0-9]{6}" placeholder="500081" required /></span></label>
                  </div>
                </>
              )}

              {accountType === "business-provider" && (
                <>
                  <fieldset className="auth-field service-category-field">
                    <legend>Service categories <span>(select all that apply)</span></legend>
                    <div className="service-category-options" tabIndex="-1">
                      {categories.map(({ name }) => (
                        <label className="service-category-option" key={name}>
                          <input type="checkbox" name="serviceCategories" value={name} />
                          <span>{name}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <label className="auth-field">
                    <span>Business address</span>
                    <textarea
                      className="auth-textarea"
                      name="businessAddress"
                      placeholder="Street address, city and PIN code"
                      rows="2"
                      minLength="5"
                      autoComplete="street-address"
                      required
                    />
                  </label>
                  <label className="auth-field">
                    <span>Service areas</span>
                    <textarea
                      className="auth-textarea"
                      name="serviceAreas"
                      placeholder="List the areas or localities your business serves"
                      rows="2"
                      minLength="2"
                      required
                    />
                  </label>
                  <div className="auth-field-row">
                    <label className="auth-field"><span>City</span><span className="auth-input-wrap"><input name="city" placeholder="Hyderabad" minLength="2" required /></span></label>
                    <label className="auth-field"><span>PIN code</span><span className="auth-input-wrap"><input name="pinCode" inputMode="numeric" pattern="[0-9]{6}" placeholder="500081" required /></span></label>
                  </div>
                </>
              )}

              {accountType && (
              <div className="auth-field-row">
                <label className="auth-field">
                  <span>Password</span>
                  <span className="auth-input-wrap">
                    <LockKeyhole size={17} />
                    <input
                      type={showPassword ? "text" : "password"}
                      name="password"
                      placeholder="At least 8 characters"
                      autoComplete="new-password"
                      minLength="8"
                      required
                    />
                    <button
                      className="password-toggle"
                      type="button"
                      onClick={() => setShowPassword((visible) => !visible)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </span>
                </label>

                <label className="auth-field">
                  <span>Confirm password</span>
                  <span className="auth-input-wrap">
                    <LockKeyhole size={17} />
                    <input
                      type={showConfirmPassword ? "text" : "password"}
                      name="confirmPassword"
                      placeholder="Repeat password"
                      autoComplete="new-password"
                      minLength="8"
                      required
                    />
                    <button
                      className="password-toggle"
                      type="button"
                      onClick={() => setShowConfirmPassword((visible) => !visible)}
                      aria-label={showConfirmPassword ? "Hide confirmation password" : "Show confirmation password"}
                    >
                      {showConfirmPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </span>
                </label>
              </div>
              )}

              {accountType && (
                <button className="primary-btn auth-submit" type="submit" disabled={submitting}>
                  {submitting ? "Creating account..." : "Create account"} <ArrowRight size={17} />
                </button>
              )}
            </form>
          )}

          <p className="auth-switch">
            {isLogin ? "New to SETHU?" : "Already have an account?"}{" "}
            <a
              href={isLogin ? "/register" : "/login"}
              onClick={(event) => {
                event.preventDefault();
                onNavigate(isLogin ? "/register" : "/login");
              }}
            >
              {isLogin ? "Create an account" : "Log in"}
            </a>
          </p>
          <p className="auth-prototype-note">
            SETHU account details are submitted to the configured API.
          </p>
        </section>
      </div>
    </main>
  );
}

function displayApiStatus(status) {
  const normalized = String(status || "").replaceAll("_", " ").toLowerCase();
  return normalized.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatApiDate(value) {
  return new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function CustomerDashboard({ onNavigate, providerProfileKey = "" }) {
  const [activeSection, setActiveSection] = useState(providerProfileKey ? "providerProfile" : "dashboard");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [serviceSearch, setServiceSearch] = useState("");
  const [locationSearch, setLocationSearch] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profile, setProfile] = useState({
    name: "Ananya Sharma",
    email: "ananya.sharma@example.com",
    phone: "+919876543210"
  });
  const [profileDraft, setProfileDraft] = useState(profile);
  const [editingProfile, setEditingProfile] = useState(false);
  const [apiState, setApiState] = useState({ status: "loading", message: "" });
  const [apiRequests, setApiRequests] = useState([]);
  const [customerRole, setCustomerRole] = useState(null);
  const [liveProviders, setLiveProviders] = useState(null);
  const [providerProfile, setProviderProfile] = useState(null);
  const [providerProfileState, setProviderProfileState] = useState({ status: "idle", message: "" });
  const [selectedService, setSelectedService] = useState(null);
  const [bookingDate, setBookingDate] = useState("");
  const [bookingArea, setBookingArea] = useState("");
  const [bookingSlot, setBookingSlot] = useState("");
  const [bookingType, setBookingType] = useState("SCHEDULED");
  const [availableSlots, setAvailableSlots] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [bookingSignInPrompt, setBookingSignInPrompt] = useState(false);
  const [requestSubmitting, setRequestSubmitting] = useState(false);

  const navigation = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "explore", label: "Explore Services", icon: Compass },
    { id: "requests", label: "My Requests", icon: ClipboardList },
    { id: "messages", label: "Messages", icon: MessageCircle },
    { id: "reviews", label: "My Reviews", icon: Star },
    { id: "profile", label: "My Profile", icon: UserRound }
  ];

  const matchingProviders = useMemo(() => {
    const serviceTerm = serviceSearch.trim().toLowerCase();
    const locationTerm = locationSearch.trim().toLowerCase();
    const sourceProviders = liveProviders || sampleDashboardProviders;
    return sourceProviders.filter((provider) => {
      const serviceMatches =
        (!serviceTerm || `${provider.name} ${provider.category} ${provider.serviceName || ""} ${provider.serviceDescription || ""} ${provider.description || ""}`.toLowerCase().includes(serviceTerm)) &&
        (!selectedCategory || provider.category === selectedCategory);
      const locationMatches =
        !locationTerm ||
        `${provider.location} ${provider.pin}`.toLowerCase().includes(locationTerm);
      return serviceMatches && locationMatches;
    });
  }, [serviceSearch, locationSearch, selectedCategory, liveProviders]);

  const visibleRequests = apiState.status === "live"
    ? apiRequests
    : sampleRequests;

  async function loadCustomerData() {
    try {
      const [profileResponse, requestResponse] = await Promise.all([
        apiRequest("/profile"),
        apiRequest("/requests")
      ]);
      const customer = profileResponse.data;
      const customerProfile = {
        name: customer.name,
        email: customer.email,
        phone: customer.phone
      };
      setCustomerRole(customer.role);
      setProfile(customerProfile);
      setProfileDraft(customerProfile);
      setApiRequests(requestResponse.data.map((request) => ({
        id: `STH-${request.id}`,
        service: request.service_name,
        provider: request.business_name || request.provider_name,
        date: formatApiDate(request.starts_at),
        status: displayApiStatus(request.status)
      })));
      setApiState({ status: "live", message: "" });
    } catch (error) {
      setCustomerRole(null);
      setApiState({
        status: error.status === 401 ? "sample" : "error",
        message: error.status === 401
          ? "Sign in to load your requests and profile from your account."
          : getApiErrorMessage(error)
      });
    }
  }

  useEffect(() => {
    if (!providerProfileKey) return;
    let active = true;
    setActiveSection("providerProfile");
    setProviderProfile(null);
    setProviderProfileState({ status: "loading", message: "" });

    if (providerProfileKey.startsWith("sample-")) {
      const sample = sampleProviderData.find((provider) => provider.key === providerProfileKey.slice(7));
      if (!sample) {
        setProviderProfileState({ status: "error", message: "This sample provider profile could not be found." });
        return () => { active = false; };
      }
      const sampleProfile = {
        provider_name: sample.name,
        business_name: sample.businessName || null,
        provider_type: sample.providerType,
        description: sample.description,
        experience_years: sample.experienceYears,
        is_sample: true,
        rating: sample.rating.toFixed(1),
        review_count: 1,
        services: [{
          name: sample.serviceName,
          description: sample.serviceDescription,
          pricingType: sample.priceType,
          priceMin: sample.priceMin,
          priceMax: sample.priceMax,
          category: sample.categoryName
        }],
        areas: [{ city: sample.city, locality: sample.locality, pinCode: sample.pinCode }],
        reviews: [{
          rating: sample.rating,
          body: sample.review,
          customerName: "SETHU customer",
          serviceName: sample.serviceName,
          createdAt: null
        }]
      };
      setProviderProfile(sampleProfile);
      setProviderProfileState({ status: "ready", message: "" });
      return () => { active = false; };
    }

    apiRequest(`/providers/${encodeURIComponent(providerProfileKey)}`)
      .then(({ data }) => {
        if (active) {
          setProviderProfile(data);
          setProviderProfileState({ status: "ready", message: "" });
        }
      })
      .catch((error) => {
        if (active) setProviderProfileState({ status: "error", message: getApiErrorMessage(error) });
      });

    return () => { active = false; };
  }, [providerProfileKey]);

  useEffect(() => {
    loadCustomerData();
  }, []);

  useEffect(() => {
    if (!selectedService || !bookingDate) {
      setAvailableSlots([]);
      return undefined;
    }
    let active = true;
    setSlotsLoading(true);
    setBookingSlot("");
    apiRequest(`/providers/${selectedService.providerId}/slots?date=${encodeURIComponent(bookingDate)}&serviceId=${encodeURIComponent(selectedService.serviceId)}`)
      .then(({ data }) => {
        if (active) setAvailableSlots(data);
      })
      .catch((error) => {
        if (active) {
          setAvailableSlots([]);
          setNotice(getApiErrorMessage(error));
        }
      })
      .finally(() => {
        if (active) setSlotsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selectedService, bookingDate]);

  function chooseSection(id) {
    setActiveSection(id);
    setSidebarOpen(false);
    setNotice("");
  }

  async function logOut() {
    if (apiState.status === "live") {
      try {
        await apiRequest("/auth/logout", { method: "POST" });
      } catch (error) {
        setNotice(getApiErrorMessage(error));
        return;
      }
    }
    onNavigate("/");
  }

  function selectCategory(name) {
    const category = selectedCategory === name ? "" : name;
    setSelectedCategory(category);
    setServiceSearch("");
    setActiveSection("explore");
    setSidebarOpen(false);
    searchLiveProviders(category, "");
  }

  function openProviderProfile(provider) {
    const key = provider.providerId || (provider.sampleKey ? `sample-${provider.sampleKey}` : "");
    if (!key) {
      setNotice("This provider profile is unavailable.");
      return;
    }
    onNavigate(`/provider-profile/${key}`);
  }

  function requestProfileService(service) {
    setBookingSignInPrompt(false);
    const blockReason = getBookingRequestBlockReason(providerProfile, service, customerRole);
    if (blockReason) {
      setNotice(blockReason);
      setBookingSignInPrompt(!providerProfile?.is_sample && !customerRole);
      return;
    }
    startBooking({
      providerId: Number(providerProfile.provider_id),
      serviceId: Number(service.serviceId),
      serviceName: service.name,
      name: providerProfile.business_name || providerProfile.provider_name,
      areas: providerProfile.areas || []
    });
  }

  useEffect(() => {
    if (selectedService) {
      document.getElementById("customer-booking-form")?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [selectedService]);

  async function searchLiveProviders(category = selectedCategory, searchTerm = serviceSearch) {
    const params = new URLSearchParams();
    if (searchTerm.trim()) params.set("service", searchTerm.trim());
    if (category) params.set("category", categorySlugs.get(category) || category);
    const place = locationSearch.trim();
    if (place) params.set("location", place);
    try {
      const { data } = await apiRequest(`/search?${params.toString()}`);
      setLiveProviders(data.map((service) => {
        const businessName = service.business_name || service.provider_name;
        const minimumPrice = Number(service.price_min).toLocaleString("en-IN");
        const maximumPrice = service.price_max == null ? "" : Number(service.price_max).toLocaleString("en-IN");
        const areaPins = [...new Set((service.areas || [])
          .map((item) => String(item.pinCode || "").trim())
          .filter(Boolean))];
        return {
          serviceId: Number(service.service_id),
          providerId: Number(service.provider_id),
          serviceName: service.service_name,
          serviceDescription: service.service_description,
          name: businessName,
          category: categoryLabels.get(service.category_slug) || service.category,
          categorySlug: service.category_slug,
          description: service.description,
          experienceYears: Number(service.experience_years || 0),
          providerType: service.provider_type,
          location: service.areas?.map((item) => `${item.locality}, ${item.city}`).join(" · ") || "",
          pin: areaPins.join(", "),
          rating: service.rating == null ? "New" : String(service.rating),
          reviews: Number(service.review_count || 0),
          price: service.pricing_type === "RANGE" && maximumPrice
            ? `₹${minimumPrice}–₹${maximumPrice}`
            : `₹${minimumPrice} onwards`,
          initials: businessName.split(" ").map((part) => part[0]).join("").slice(0, 2),
          tone: "lavender",
          isSample: Boolean(service.is_sample),
          areas: service.areas || []
        };
      }));
      setNotice("");
    } catch (error) {
      setNotice(getApiErrorMessage(error));
    }
  }

  function startBooking(service) {
    if (!service.serviceId) {
      setNotice(`${service.name} is a sample provider. Sign in and search live services to request a booking.`);
      return;
    }
    setSelectedService(service);
    setBookingDate(new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
    setBookingArea(service.areas[0] ? "0" : "");
    setBookingSlot("");
    setBookingType("SCHEDULED");
  }

  async function submitServiceRequest(event) {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    if (customerRole !== "CUSTOMER") {
      setNotice(customerRole
        ? "Use a customer account to submit this request."
        : "Sign in with a customer account to submit this request.");
      setBookingSignInPrompt(!customerRole);
      return;
    }
    const area = selectedService.areas[Number(bookingArea)];
    const slot = availableSlots.find((item) => item.slot_start === bookingSlot);
    if (!area || !slot) {
      setNotice("Select a service area and an available appointment slot.");
      return;
    }
    setRequestSubmitting(true);
    try {
      await apiRequest("/requests", {
        method: "POST",
        body: {
          providerId: selectedService.providerId,
          serviceId: selectedService.serviceId,
          city: area.city,
          locality: area.locality,
          pinCode: String(area.pinCode).trim(),
          startsAt: slot.slot_start,
          endsAt: slot.slot_end,
          type: bookingType
        }
      });
      await loadCustomerData();
      setSelectedService(null);
      setNotice("Your service request was sent successfully.");
    } catch (error) {
      setNotice(getApiErrorMessage(error));
    } finally {
      setRequestSubmitting(false);
    }
  }

  async function saveProfile(event) {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    if (apiState.status === "live") {
      try {
        await apiRequest("/profile", { method: "PATCH", body: profileDraft });
        setProfile(profileDraft);
        setEditingProfile(false);
        setNotice("Profile changes were saved to your SETHU account.");
      } catch (error) {
        setNotice(getApiErrorMessage(error));
      }
      return;
    }
    setProfile(profileDraft);
    setEditingProfile(false);
    setNotice("Profile changes are shown in this prototype only; nothing has been saved to a server.");
  }

  function renderProviders(limit) {
    const visible = typeof limit === "number"
      ? matchingProviders.slice(0, limit)
      : matchingProviders;

    return (
      <>
        <div className="dashboard-provider-grid">
          {visible.map((provider) => (
            <article className="dashboard-provider-card" key={provider.serviceId || provider.name}>
              <div className={`dashboard-provider-avatar ${provider.tone}`}>
                {provider.initials}
                {provider.isSample && <span className="sample-provider-dot" />}
              </div>
              <div className="dashboard-provider-info">
                <div className="dashboard-provider-topline">
                  <span className="dashboard-provider-category">{provider.category}</span>
                  <span className="dashboard-rating"><Star size={14} fill="currentColor" /> {provider.rating}</span>
                </div>
                <h3>{provider.name}</h3>
                <span className={`dashboard-provider-sample-label ${provider.isSample ? "sample" : "registered"}`}>
                  {provider.isSample ? "Sample provider" : "Registered provider"}
                </span>
                {provider.serviceName && <p className="dashboard-provider-service">{provider.serviceName}</p>}
                {provider.description && <p className="dashboard-provider-description">{provider.description}</p>}
                <p className="dashboard-provider-location"><MapPin size={14} /> {provider.location}{provider.pin ? ` · PIN ${provider.pin}` : ""}</p>
                <p className="dashboard-provider-experience">{provider.providerType === "BUSINESS" ? "Business provider" : "Individual provider"} · {provider.experienceYears} years’ experience · {provider.reviews} {provider.reviews === 1 ? "review" : "reviews"}</p>
                <div className="dashboard-provider-bottom">
                  <strong>{provider.price}</strong>
                  <button
                    className="dashboard-outline-btn"
                    onClick={() => openProviderProfile(provider)}
                  >
                    View Profile <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            </article>
          ))}
          {visible.length === 0 && (
            <div className="dashboard-empty-state">
              <Search size={25} />
              <strong>No providers match your search</strong>
              <span>Try a different service, category, locality or PIN code.</span>
              <button
                className="dashboard-link-btn"
                onClick={() => {
                  setServiceSearch("");
                  setLocationSearch("");
                  setSelectedCategory("");
                }}
              >
                Clear filters
              </button>
            </div>
          )}
        </div>
        <p className="dashboard-sample-note">{liveProviders ? "Sample listings are labelled; other results are registered providers." : "These sample listings are for demonstration and are not registered providers."}</p>
      </>
    );
  }

  function renderRequests() {
    return (
      <div className="dashboard-table-wrap">
        <table className="dashboard-request-table">
          <thead>
            <tr>
              <th>Service request</th>
              <th>Provider</th>
              <th>Requested date</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {visibleRequests.map((request) => (
              <tr key={request.id}>
                <td>
                  <strong>{request.service}</strong>
                  <small>{request.id}{apiState.status === "live" ? "" : " · Sample request"}</small>
                </td>
                <td>{request.provider}</td>
                <td>{request.date}</td>
                <td><span className={`request-status status-${request.status.toLowerCase().replaceAll(" ", "-")}`}>{request.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="dashboard-request-cards">
          {visibleRequests.map((request) => (
            <article className="dashboard-request-card" key={request.id}>
              <div className="dashboard-request-card-heading">
                <strong>{request.service}</strong>
                <span className={`request-status status-${request.status.toLowerCase().replaceAll(" ", "-")}`}>{request.status}</span>
              </div>
              <span>{request.provider}</span>
              <small>{request.date} · {request.id}{apiState.status === "live" ? "" : " · Sample request"}</small>
            </article>
          ))}
        </div>
        <p className="dashboard-sample-note">{apiState.status === "live" ? "Requests are loaded from your SETHU account." : "All requests shown are sample data."}</p>
      </div>
    );
  }

  const sectionTitles = {
    dashboard: ["Dashboard", "Your neighbourhood services at a glance."],
    explore: ["Explore Services", "Browse sample local providers by service and location."],
    providerProfile: ["Provider profile", "Services, coverage, experience and customer reviews."],
    requests: ["My Requests", "Review the status of your sample service requests."],
    messages: ["Messages", "A preview of conversations with service providers."],
    reviews: ["My Reviews", "Your sample feedback for completed services."],
    profile: ["My Profile", "Manage the customer details shown in this prototype."]
  };
  const [sectionTitle, sectionSubtitle] = sectionTitles[activeSection];

  return (
    <div className="customer-dashboard">
      {sidebarOpen && (
        <button
          className="dashboard-sidebar-backdrop"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close dashboard navigation"
        />
      )}
      <aside className={`dashboard-sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
        <a
          className="brand dashboard-brand"
          href="/"
          onClick={(event) => {
            event.preventDefault();
            onNavigate("/");
          }}
          aria-label="SETHU home"
        >
          <span className="brand-mark">S</span>
          <span>SETHU<span className="brand-dot">.</span></span>
        </a>

        <div className="dashboard-sidebar-label">CUSTOMER MENU</div>
        <nav className="dashboard-navigation" aria-label="Customer dashboard">
          {navigation.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`dashboard-nav-item ${activeSection === id ? "active" : ""}`}
              onClick={() => chooseSection(id)}
              aria-current={activeSection === id ? "page" : undefined}
            >
              <Icon size={18} />
              <span>{label}</span>
              {id === "messages" && <span className="dashboard-unread-dot" aria-label="Unread message" />}
            </button>
          ))}
        </nav>

        <div className="dashboard-sidebar-bottom">
          <div className="dashboard-sidebar-help">
            <ShieldCheck size={18} />
            <span><strong>Here for your neighbourhood</strong><small>SETHU service portal</small></span>
          </div>
          <button className="dashboard-nav-item dashboard-logout" onClick={logOut}>
            <LogOut size={18} /><span>Logout</span>
          </button>
          <span className="dashboard-version">SETHU · Prototype</span>
        </div>
      </aside>

      <main className="dashboard-main">
        <header className="dashboard-topbar">
          <button
            className="dashboard-mobile-menu"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open dashboard navigation"
          >
            <Menu size={21} />
          </button>
          <div className="dashboard-breadcrumb">
            <span>Customer portal</span><ChevronRight size={14} /><strong>{sectionTitle}</strong>
          </div>
          <div className="dashboard-topbar-user">
            <span className="dashboard-topbar-greeting">Welcome back,</span>
            <span className="dashboard-topbar-name">{profile.name.split(" ")[0]}</span>
            <span className="dashboard-user-avatar">{profile.name.split(" ").map((part) => part[0]).join("").slice(0, 2)}</span>
          </div>
        </header>

        <div className="dashboard-content">
          <div className="dashboard-page-heading">
            <div>
              <span className="dashboard-eyebrow">YOUR LOCAL SERVICES</span>
              <h1>{activeSection === "dashboard" ? "Welcome to SETHU!" : sectionTitle}</h1>
              <p>{activeSection === "dashboard" ? "Find trusted help and keep track of your service requests." : sectionSubtitle}</p>
            </div>
            {activeSection === "dashboard" && (
              <div className="dashboard-date-chip"><CalendarDays size={16} /> October 30, 2026</div>
            )}
          </div>

          {notice && (
            <div className="dashboard-notice" role="status">
              <span>{notice}</span>
              {bookingSignInPrompt && <button className="dashboard-link-btn" onClick={() => onNavigate("/login")}>Sign in</button>}
              <button onClick={() => setNotice("")} aria-label="Dismiss message"><X size={16} /></button>
            </div>
          )}

          {apiState.status !== "live" && (
            <div className="dashboard-notice provider-api-notice" role={apiState.status === "error" ? "alert" : "status"}>
              <span>{apiState.status === "loading" ? "Connecting to your SETHU account…" : apiState.status === "sample" ? `Sample preview: ${apiState.message}` : `Live account data is unavailable: ${apiState.message}`}</span>
              {apiState.status === "sample"
                ? <button className="dashboard-link-btn" onClick={() => onNavigate("/login")}>Sign in</button>
                : apiState.status === "error" && <button className="dashboard-link-btn" onClick={loadCustomerData}>Retry</button>}
            </div>
          )}

          {activeSection === "providerProfile" && (
            <section className="dashboard-section-block dashboard-panel customer-provider-profile">
              <button className="dashboard-link-btn customer-provider-profile-back" onClick={() => onNavigate("/customer-dashboard")}>
                <ArrowLeft size={15} /> Back to Explore Services
              </button>
              {providerProfileState.status === "loading" && <p role="status">Loading provider profile…</p>}
              {providerProfileState.status === "error" && (
                <div className="dashboard-empty-state" role="alert">
                  <strong>Provider profile unavailable</strong>
                  <span>{providerProfileState.message}</span>
                  <button className="dashboard-outline-btn" onClick={() => onNavigate("/customer-dashboard")}>Return to services</button>
                </div>
              )}
              {providerProfileState.status === "ready" && providerProfile && (
                <>
                  <div className="customer-provider-profile-heading">
                    <span className="dashboard-profile-avatar">
                      {(providerProfile.business_name || providerProfile.provider_name || "SP")
                        .split(" ").map((part) => part[0]).join("").slice(0, 2)}
                    </span>
                    <div>
                      <span className={`dashboard-provider-sample-label ${providerProfile.is_sample ? "sample" : "registered"}`}>
                        {providerProfile.is_sample ? "Sample provider" : "Registered provider"}
                      </span>
                      <h2>{providerProfile.business_name || providerProfile.provider_name}</h2>
                      {providerProfile.business_name && <p>{providerProfile.provider_name} · Business provider</p>}
                      {!providerProfile.business_name && <p>Individual service provider</p>}
                      <div className="customer-provider-rating"><Star size={15} fill="currentColor" /> {providerProfile.rating} · {providerProfile.review_count} {providerProfile.review_count === 1 ? "review" : "reviews"}</div>
                    </div>
                  </div>
                  <p className="customer-provider-profile-description">{providerProfile.description}</p>
                  <div className="customer-provider-profile-facts">
                    <div><span>Experience</span><strong>{providerProfile.experience_years} years</strong></div>
                    <div><span>Provider type</span><strong>{providerProfile.provider_type === "BUSINESS" ? "Business" : "Individual"}</strong></div>
                    <div><span>Service areas</span><strong>{providerProfile.areas?.length || 0}</strong></div>
                  </div>

                  <div className="customer-provider-profile-section">
                    <h3>Services</h3>
                    <div className="customer-provider-service-list">
                      {(providerProfile.services || []).map((service) => (
                        <article className="customer-provider-service" key={service.serviceId || `${service.category}-${service.name}`}>
                          <div>
                            <span>{service.category}</span>
                            <h4>{service.name}</h4>
                            <p>{service.description}</p>
                            <strong>
                              {service.pricingType === "RANGE" && service.priceMax != null
                                ? `₹${Number(service.priceMin).toLocaleString("en-IN")}–₹${Number(service.priceMax).toLocaleString("en-IN")}`
                                : `₹${Number(service.priceMin).toLocaleString("en-IN")} onwards`}
                            </strong>
                          </div>
                          <button className="dashboard-outline-btn" onClick={() => requestProfileService(service)}>Request service <ArrowRight size={14} /></button>
                        </article>
                      ))}
                      {!providerProfile.services?.length && <p>No active services are listed.</p>}
                    </div>
                  </div>

                  <div className="customer-provider-profile-section">
                    <h3>Service areas</h3>
                    <div className="customer-provider-area-list">
                      {(providerProfile.areas || []).map((area) => (
                        <span key={`${area.city}-${area.locality}-${area.pinCode}`}>
                          <MapPin size={14} /> {area.locality}, {area.city} · PIN {String(area.pinCode).trim()}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="customer-provider-profile-section">
                    <h3>Customer reviews</h3>
                    <div className="dashboard-review-list">
                      {(providerProfile.reviews || []).map((review, index) => (
                        <article className="dashboard-review-card" key={`${review.createdAt || "sample"}-${index}`}>
                          <div className="dashboard-review-heading">
                            <strong>{review.customerName || "Customer"}{review.serviceName ? ` · ${review.serviceName}` : ""}</strong>
                            <span><Star size={14} fill="currentColor" /> {Number(review.rating).toFixed(1)}</span>
                          </div>
                          <p>“{review.body}”</p>
                          {review.createdAt && <small>{new Date(review.createdAt).toLocaleDateString("en-IN")}</small>}
                        </article>
                      ))}
                      {!providerProfile.reviews?.length && <p>No customer reviews yet.</p>}
                    </div>
                  </div>
                </>
              )}
            </section>
          )}

          {selectedService && (
            <form id="customer-booking-form" className="provider-form-card customer-booking-form" onSubmit={submitServiceRequest}>
              <div className="provider-form-heading">
                <div><h3>Request {selectedService.serviceName}</h3><p>{selectedService.name} · Select an available appointment.</p></div>
                <button type="button" className="provider-form-close" onClick={() => setSelectedService(null)} aria-label="Close booking form"><X size={17} /></button>
              </div>
              <div className="provider-form-grid">
                <label className="provider-form-field">
                  <span>Service location</span>
                  <select value={bookingArea} onChange={(event) => setBookingArea(event.target.value)} required>
                    <option value="" disabled>Select an area</option>
                    {selectedService.areas.map((area, index) => (
                      <option key={`${area.city}-${area.locality}-${area.pinCode}`} value={String(index)}>{area.locality}, {area.city} ({String(area.pinCode).trim()})</option>
                    ))}
                  </select>
                </label>
                <label className="provider-form-field">
                  <span>Appointment date</span>
                  <input type="date" min={new Date().toISOString().slice(0, 10)} value={bookingDate} onChange={(event) => setBookingDate(event.target.value)} required />
                </label>
                <label className="provider-form-field">
                  <span>Available time</span>
                  <select value={bookingSlot} onChange={(event) => setBookingSlot(event.target.value)} required disabled={slotsLoading || availableSlots.length === 0}>
                    <option value="">{slotsLoading ? "Loading available times…" : availableSlots.length ? "Select a time" : "No available times"}</option>
                    {availableSlots.map((slot) => (
                      <option key={slot.slot_start} value={slot.slot_start}>
                        {new Date(slot.slot_start).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })} – {new Date(slot.slot_end).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="provider-form-field">
                  <span>Request type</span>
                  <select value={bookingType} onChange={(event) => setBookingType(event.target.value)}>
                    <option value="SCHEDULED">Scheduled</option>
                    <option value="URGENT">Urgent</option>
                  </select>
                </label>
              </div>
              <div className="dashboard-profile-actions">
                <button className="primary-btn" type="submit" disabled={requestSubmitting || slotsLoading || !availableSlots.length}><Check size={15} /> {requestSubmitting ? "Sending…" : "Send request"}</button>
                <button className="dashboard-cancel-btn" type="button" onClick={() => setSelectedService(null)}>Cancel</button>
              </div>
            </form>
          )}

          {(activeSection === "dashboard" || activeSection === "explore") && (
            <>
              <form className="dashboard-search-panel" onSubmit={(event) => {
                event.preventDefault();
                setActiveSection("explore");
                searchLiveProviders();
              }}>
                <label className="dashboard-search-field">
                  <Search size={18} />
                  <input
                    value={serviceSearch}
                    onChange={(event) => setServiceSearch(event.target.value)}
                    placeholder="Search a service or provider"
                    aria-label="Search services or providers"
                  />
                </label>
                <span className="dashboard-search-divider" />
                <label className="dashboard-search-field location-search-field">
                  <MapPin size={18} />
                  <input
                    value={locationSearch}
                    onChange={(event) => setLocationSearch(event.target.value)}
                    placeholder="City, locality or PIN code"
                    aria-label="Search by city locality or PIN code"
                  />
                </label>
                <button className="primary-btn dashboard-search-submit" type="submit">
                  Search <ArrowRight size={16} />
                </button>
              </form>

              <section className="dashboard-section-block">
                <div className="dashboard-section-heading">
                  <div>
                    <h2>Explore by category</h2>
                    <p>Choose a service to find nearby sample providers.</p>
                  </div>
                  {selectedCategory && (
                    <button
                      className="dashboard-link-btn"
                      onClick={() => {
                        setSelectedCategory("");
                        searchLiveProviders("", serviceSearch);
                      }}
                    >
                      Clear category
                    </button>
                  )}
                </div>
                <div className="dashboard-category-grid">
                  {dashboardCategories.map(({ name, icon: Icon, tone }) => (
                    <button
                      className={`dashboard-category-card ${selectedCategory === name ? "selected" : ""}`}
                      key={name}
                      onClick={() => selectCategory(name)}
                      aria-pressed={selectedCategory === name}
                    >
                      <span className={`dashboard-category-icon ${tone}`}><Icon size={21} /></span>
                      <strong>{name}</strong>
                      <ArrowRight size={15} className="dashboard-category-arrow" />
                    </button>
                  ))}
                </div>
              </section>

              <section className="dashboard-section-block">
                <div className="dashboard-section-heading">
                  <div>
                    <h2>{activeSection === "dashboard" ? "Recommended Providers" : "Service providers"}</h2>
                    <p>
                      {matchingProviders.length} {matchingProviders.length === 1 ? "provider" : "providers"}
                      {selectedCategory ? ` in ${selectedCategory}` : " match your filters"}.
                    </p>
                  </div>
                  {activeSection === "dashboard" && (
                    <button className="dashboard-link-btn" onClick={() => chooseSection("explore")}>
                      Explore all <ArrowRight size={15} />
                    </button>
                  )}
                </div>
                {renderProviders(activeSection === "dashboard" ? 4 : undefined)}
              </section>

              {activeSection === "dashboard" && (
                <section className="dashboard-section-block dashboard-recent-requests">
                  <div className="dashboard-section-heading">
                    <div>
                      <h2>Recent requests</h2>
                      <p>Keep an eye on your latest service updates.</p>
                    </div>
                    <button className="dashboard-link-btn" onClick={() => chooseSection("requests")}>
                      View all <ArrowRight size={15} />
                    </button>
                  </div>
                  <div className="dashboard-recent-request-list">
                    {visibleRequests.slice(0, 3).map((request) => (
                      <div className="dashboard-recent-request" key={request.id}>
                        <span className="dashboard-request-icon"><Wrench size={17} /></span>
                        <span className="dashboard-recent-request-details"><strong>{request.service}</strong><small>{request.provider} · {request.date}</small></span>
                        <span className={`request-status status-${request.status.toLowerCase().replaceAll(" ", "-")}`}>{request.status}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}

          {activeSection === "requests" && (
            <section className="dashboard-section-block dashboard-panel">
              <div className="dashboard-section-heading">
                <div><h2>All requests</h2><p>{apiState.status === "live" ? "Request history from your SETHU account." : "Sample request history for the customer dashboard."}</p></div>
                <span className="dashboard-count-chip">{visibleRequests.length} requests</span>
              </div>
              {renderRequests()}
            </section>
          )}

          {activeSection === "messages" && (
            <section className="dashboard-section-block dashboard-panel">
              <div className="dashboard-section-heading">
                <div><h2>Recent conversations</h2><p>Sample messages to preview your provider conversations.</p></div>
                <span className="dashboard-count-chip">Sample data</span>
              </div>
              <div className="dashboard-conversation-list">
                {[
                  ["Ramesh Kumar", "I can visit tomorrow morning to take a look.", "Today · 10:42 AM", "RK"],
                  ["Arjun Electricals", "Thanks for your request. Your slot is confirmed.", "Yesterday · 4:18 PM", "AE"],
                  ["FreshNest Services", "Please share any access instructions for the property.", "Oct 26 · 11:05 AM", "FN"]
                ].map(([name, message, time, initials]) => (
                  <article className="dashboard-conversation" key={name}>
                    <span className="dashboard-user-avatar">{initials}</span>
                    <div><strong>{name}</strong><p>{message}</p><small>{time} · Sample conversation</small></div>
                    <MessageCircle size={18} />
                  </article>
                ))}
              </div>
            </section>
          )}

          {activeSection === "reviews" && (
            <section className="dashboard-section-block dashboard-panel">
              <div className="dashboard-section-heading">
                <div><h2>Your feedback</h2><p>Sample reviews associated with completed services.</p></div>
                <span className="dashboard-count-chip">2 reviews</span>
              </div>
              <div className="dashboard-review-list">
                {[
                  ["FreshNest Services", "The team was thorough and arrived right on time.", "Oct 18, 2026"],
                  ["CityCare Auto", "Clear estimate and a smooth service experience.", "Oct 10, 2026"]
                ].map(([name, text, date]) => (
                  <article className="dashboard-review-card" key={name}>
                    <div className="dashboard-review-heading"><strong>{name}</strong><span><Star size={14} fill="currentColor" /> 5.0</span></div>
                    <p>“{text}”</p>
                    <small>{date} · Sample review</small>
                  </article>
                ))}
              </div>
            </section>
          )}

          {activeSection === "profile" && (
            <section className="dashboard-section-block dashboard-panel dashboard-profile-panel">
              <div className="dashboard-section-heading">
                <div><h2>Customer details</h2><p>{apiState.status === "live" ? "Manage the customer details saved to your SETHU account." : "Your profile is sample data and is only kept in this page session."}</p></div>
                {!editingProfile && (
                  <button className="dashboard-outline-btn" onClick={() => {
                    setProfileDraft(profile);
                    setEditingProfile(true);
                  }}>
                    <Pencil size={14} /> Edit Profile
                  </button>
                )}
              </div>
              {editingProfile ? (
                <form className="dashboard-profile-form" onSubmit={saveProfile}>
                  <label><span>Customer name</span><input value={profileDraft.name} onChange={(event) => setProfileDraft({ ...profileDraft, name: event.target.value })} minLength="2" required /></label>
                  <label><span>Email address</span><input type="email" value={profileDraft.email} onChange={(event) => setProfileDraft({ ...profileDraft, email: event.target.value })} required /></label>
                  <label><span>Phone number</span><input type="tel" value={profileDraft.phone} onChange={(event) => setProfileDraft({ ...profileDraft, phone: event.target.value })} pattern="[+]?[0-9]{7,15}" title="Enter 7 to 15 digits, with an optional leading +." required /></label>
                  <div className="dashboard-profile-actions">
                    <button className="primary-btn" type="submit"><Check size={16} /> Save changes</button>
                    <button className="dashboard-cancel-btn" type="button" onClick={() => setEditingProfile(false)}>Cancel</button>
                  </div>
                </form>
              ) : (
                <div className="dashboard-profile-details">
                  <span className="dashboard-profile-avatar">{profile.name.split(" ").map((part) => part[0]).join("").slice(0, 2)}</span>
                  <div className="dashboard-profile-field"><span>Full name</span><strong>{profile.name}</strong></div>
                  <div className="dashboard-profile-field"><span>Email address</span><strong>{profile.email}</strong></div>
                  <div className="dashboard-profile-field"><span>Phone number</span><strong>{profile.phone}</strong></div>
                  <div className="dashboard-profile-field"><span>Account type</span><strong>{apiState.status === "live" ? "Customer account" : "Customer · Sample profile"}</strong></div>
                </div>
              )}
              <p className="dashboard-sample-note">{apiState.status === "live" ? "Profile values are loaded from your SETHU account." : "Profile values are sample data and are not sent to or stored by a backend."}</p>
            </section>
          )}
        </div>
      </main>
      {sidebarOpen && (
        <button
          className="dashboard-sidebar-close"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close dashboard navigation"
        >
          <X size={19} />
        </button>
      )}
    </div>
  );
}

function ProviderDashboard({ onNavigate, business = false }) {
  const [activeSection, setActiveSection] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [services, setServices] = useState(() => business ? [
    { id: 1, name: "Home deep cleaning", category: "Cleaning", description: "Detailed home cleaning with flexible room-by-room packages.", priceType: "range", price: "1200", maxPrice: "4500", areas: "Madhapur, Kondapur, Gachibowli", pins: "500081, 500084, 500032" },
    { id: 2, name: "Kitchen & bathroom cleaning", category: "Cleaning", description: "Focused cleaning for kitchens, bathrooms and high-use spaces.", priceType: "fixed", price: "899", maxPrice: "", areas: "Madhapur, Kondapur", pins: "500081, 500084" }
  ] : [
    { id: 1, name: "Tap & pipe repairs", category: "Plumbing", description: "Leak repair, tap replacement and minor pipe work for homes.", priceType: "range", price: "300", maxPrice: "1200", areas: "Madhapur, Kondapur", pins: "500081, 500084" },
    { id: 2, name: "Bathroom fixture installation", category: "Plumbing", description: "Installation and replacement of bathroom fixtures and fittings.", priceType: "fixed", price: "650", maxPrice: "", areas: "Madhapur, Gachibowli", pins: "500081, 500032" }
  ]);
  const [showServiceForm, setShowServiceForm] = useState(false);
  const [editingServiceId, setEditingServiceId] = useState(null);
  const [serviceDraft, setServiceDraft] = useState({
    name: "", category: "", description: "", priceType: "fixed",
    price: "", maxPrice: "", areas: "", pins: ""
  });
  const [requests, setRequests] = useState(() => [
    { id: "REQ-3108", customer: "Ananya Sharma", service: "Kitchen sink repair", locality: "Madhapur", date: "Nov 2, 2026", time: "9:00 AM – 11:00 AM", type: "Urgent", status: "Pending" },
    { id: "REQ-3099", customer: "Vikram Reddy", service: "Bathroom tap replacement", locality: "Kondapur", date: "Nov 3, 2026", time: "1:00 PM – 3:00 PM", type: "Scheduled", status: "Pending" },
    { id: "REQ-3071", customer: "Meera Nair", service: "Pipe leak inspection", locality: "Madhapur", date: "Nov 1, 2026", time: "10:00 AM – 12:00 PM", type: "Scheduled", status: "Accepted" },
    { id: "REQ-3012", customer: "Rohan Das", service: "Wash basin installation", locality: "Gachibowli", date: "Oct 26, 2026", time: "2:00 PM – 4:00 PM", type: "Scheduled", status: "In Progress" },
    { id: "REQ-2975", customer: "Sara Khan", service: "Kitchen drain unclogging", locality: "Kondapur", date: "Oct 20, 2026", time: "11:00 AM – 1:00 PM", type: "Scheduled", status: "Completed" },
    ...(business ? [
      { id: "REQ-2942", customer: "Aarav Mehta", service: "Move-in cleaning", locality: "Jubilee Hills", date: "Oct 16, 2026", time: "9:00 AM – 12:00 PM", type: "Scheduled", status: "Cancelled" },
      { id: "REQ-2918", customer: "Priya Iyer", service: "Office cleaning", locality: "Hitech City", date: "Oct 12, 2026", time: "2:00 PM – 5:00 PM", type: "Urgent", status: "Rejected" }
    ] : [])
  ]);
  const [workingDays, setWorkingDays] = useState(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]);
  const [workingHours, setWorkingHours] = useState({ start: "09:00", end: "18:00" });
  const [appointmentDuration, setAppointmentDuration] = useState("60");
  const [blockedSlots, setBlockedSlots] = useState([
    { id: 1, date: "2026-11-06", time: "1:00 PM – 3:00 PM" },
    { id: 2, date: "2026-11-12", time: "All day" }
  ]);
  const [blockDraft, setBlockDraft] = useState({ date: "", time: "" });
  const [profile, setProfile] = useState(() => business ? {
    name: "Sethu HomeCare Services",
    logo: "",
    email: "hello@sethuhomecare.example",
    phone: "+914040123456",
    description: "Reliable home cleaning and maintenance from a trained local team. Flexible visits, clear estimates and quality checks on every job.",
    experience: "6",
    categories: "Cleaning, Home Repairs",
    areas: "Madhapur, Kondapur, Gachibowli",
    address: "Plot 18, Kavuri Hills",
    city: "Hyderabad",
    locality: "Madhapur",
    pin: "500081"
  } : {
    name: "Ramesh Kumar",
    email: "ramesh.kumar@example.com",
    phone: "+919876543210",
    experience: "8",
    categories: "Plumbing, Home Repairs",
    areas: "Madhapur, Kondapur, Gachibowli"
  });
  const [profileDraft, setProfileDraft] = useState(profile);
  const [editingProfile, setEditingProfile] = useState(false);
  const [apiState, setApiState] = useState({ status: "loading", message: "" });
  const [apiCategories, setApiCategories] = useState([]);
  const [businessLogoFile, setBusinessLogoFile] = useState(null);
  const [staff, setStaff] = useState([
    { id: 1, name: "Kavita Rao", role: "Cleaning supervisor", email: "kavita@sethuhomecare.example" },
    { id: 2, name: "Imran Shaikh", role: "Home services technician", email: "imran@sethuhomecare.example" },
    { id: 3, name: "Deepa Reddy", role: "Cleaning professional", email: "deepa@sethuhomecare.example" }
  ]);
  const [showStaffForm, setShowStaffForm] = useState(false);
  const [staffDraft, setStaffDraft] = useState({ name: "", role: "", email: "" });
  const [reviewData, setReviewData] = useState([
    { name: "Ananya Sharma", service: "Tap repair", date: "Oct 24, 2026", rating: 5, text: "Very professional, arrived on time and fixed the issue quickly." },
    { name: "Vikram Reddy", service: "Pipe repair", date: "Oct 19, 2026", rating: 5, text: "Clear estimate and excellent work. Would recommend." },
    { name: "Meera Nair", service: "Fixture installation", date: "Oct 12, 2026", rating: 4, text: "Good service and friendly communication." }
  ]);
  const [activities, setActivities] = useState([
    { id: 1, text: "New urgent request from Ananya Sharma", detail: "Kitchen sink repair · Madhapur", time: "Today, 9:42 AM", tone: "peach" },
    { id: 2, text: "Booking marked in progress", detail: "Wash basin installation · Rohan Das", time: "Yesterday, 2:10 PM", tone: "lavender" },
    { id: 3, text: "Received a 5-star review", detail: "“Clear estimate and excellent work.”", time: "Oct 19, 2026", tone: "mint" },
    { id: 4, text: "Service listing updated", detail: "Tap & pipe repairs", time: "Oct 18, 2026", tone: "sky" }
  ]);

  const navigation = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "services", label: "My Services", icon: Wrench },
    { id: "requests", label: "Service Requests", icon: ClipboardList },
    { id: "availability", label: "Availability", icon: CalendarDays },
    { id: "bookings", label: "My Bookings", icon: Clock3 },
    { id: "reviews", label: "Reviews", icon: Star },
    { id: "profile", label: business ? "Business Profile" : "My Profile", icon: business ? Building2 : UserRound },
    ...(business ? [{ id: "team", label: "Team Management", icon: Users }] : [])
  ];
  const averageRating = reviewData.length
    ? (reviewData.reduce((total, review) => total + review.rating, 0) / reviewData.length).toFixed(1)
    : "0.0";
  const pendingRequestCount = requests.filter((request) => request.status === "Pending").length;
  const acceptedBookingCount = requests.filter((request) =>
    ["Accepted", "In Progress"].includes(request.status)
  ).length;
  const completedJobCount = requests.filter((request) => request.status === "Completed").length;
  const bookings = business
    ? requests
    : requests.filter((request) => ["Accepted", "In Progress", "Completed"].includes(request.status));
  const sectionTitles = {
    dashboard: ["Dashboard", "Your service business at a glance."],
    services: ["My Services", "Create and manage the services customers can request."],
    requests: ["Service Requests", "Review customer requests and respond to new work."],
    availability: ["Availability", "Set your working hours and block time away."],
    bookings: ["My Bookings", "Track accepted, active and completed jobs."],
    reviews: ["Reviews", "See feedback from customers you have served."],
    profile: [business ? "Business Profile" : "My Profile", business ? "Manage the details customers see about your business." : "Manage the details customers see about your business."],
    ...(business ? { team: ["Team Management", "Manage the staff members in your business profile."] } : {})
  };
  const [sectionTitle, sectionSubtitle] = sectionTitles[activeSection];
  const serviceCategoryOptions = apiCategories.length
    ? apiCategories.map((category) => category.name)
    : dashboardCategories.map((category) => category.name);
  const weekDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

  async function loadProviderData() {
    try {
      const profileResponse = await apiRequest("/profile");
      const responses = await Promise.all([
        apiRequest("/services"),
        apiRequest("/requests"),
        apiRequest("/bookings"),
        apiRequest("/categories"),
        apiRequest("/availability"),
        apiRequest(`/providers/${profileResponse.data.id}/reviews`),
        business ? apiRequest("/team") : Promise.resolve({ data: [] })
      ]);
      const [serviceResponse, requestResponse, bookingResponse, categoryResponse, availabilityResponse, reviewResponse, teamResponse] = responses;
      const backendProfile = profileResponse.data;
      const nextProfile = {
        ...profile,
        name: backendProfile.business_name || backendProfile.name,
        logo: backendProfile.logo_path || "",
        email: backendProfile.email,
        phone: backendProfile.phone,
        description: backendProfile.description || "",
        experience: String(backendProfile.experience_years || 0),
        categories: (backendProfile.categories || []).join(", ") || profile.categories,
        areas: (backendProfile.areas || []).map((area) => area.locality).join(", ") || profile.areas,
        address: backendProfile.business_address || backendProfile.address || "",
        city: backendProfile.business_city || backendProfile.city || backendProfile.areas?.[0]?.city || "",
        locality: backendProfile.business_locality || backendProfile.locality || backendProfile.areas?.[0]?.locality || "",
        pin: (backendProfile.business_pin_code || backendProfile.pin_code || backendProfile.areas?.[0]?.pinCode || "").trim()
      };
      setProfile(nextProfile);
      setProfileDraft(nextProfile);
      setApiCategories(categoryResponse.data);
      setServices(serviceResponse.data.map((service) => ({
        id: Number(service.id),
        categoryId: Number(service.category_id),
        name: service.name,
        category: service.category,
        description: service.description,
        priceType: service.pricing_type.toLowerCase() === "range" ? "range" : "fixed",
        price: String(service.price_min),
        maxPrice: service.price_max == null ? "" : String(service.price_max),
        areas: service.areas.map((area) => area.locality).join(", "),
        pins: [...new Set(service.areas.map((area) => area.pinCode.trim()))].join(", ")
      })));
      const bookingsByRequest = new Map(bookingResponse.data.map((booking) => [Number(booking.request_id), booking]));
      setRequests(requestResponse.data.map((request) => {
        const booking = bookingsByRequest.get(Number(request.id));
        const apiStatus = booking?.status === "CONFIRMED" ? "Accepted" : displayApiStatus(booking?.status || request.status);
        const start = new Date(request.starts_at);
        const end = new Date(request.ends_at);
        return {
          id: String(request.id),
          requestId: Number(request.id),
          bookingId: booking?.booking_id ? Number(booking.booking_id) : null,
          customer: request.customer_name || "Customer",
          service: request.service_name,
          locality: request.locality || request.business_locality || "",
          date: formatApiDate(request.starts_at),
          time: `${start.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })} – ${end.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}`,
          type: request.request_type === "URGENT" ? "Urgent" : "Scheduled",
          status: apiStatus
        };
      }));
      setWorkingDays(availabilityResponse.data.availability.map((day) => weekDays[(Number(day.weekday) + 6) % 7]));
      if (availabilityResponse.data.availability.length) {
        setWorkingHours({ start: String(availabilityResponse.data.availability[0].start_time).slice(0, 5), end: String(availabilityResponse.data.availability[0].end_time).slice(0, 5) });
        setAppointmentDuration(String(availabilityResponse.data.availability[0].appointment_minutes));
      }
      setBlockedSlots(availabilityResponse.data.blockedSlots.map((slot) => ({
        id: Number(slot.id),
        date: new Date(slot.starts_at).toISOString().slice(0, 10),
        time: `${new Date(slot.starts_at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })} – ${new Date(slot.ends_at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}`
      })));
      setReviewData(reviewResponse.data.map((review) => ({
        name: review.customer_name,
        service: review.service_name || "Completed service",
        date: formatApiDate(review.created_at),
        rating: Number(review.rating),
        text: review.body
      })));
      setStaff(teamResponse.data.map((member) => ({
        id: Number(member.id), name: member.name, role: member.role, email: member.email, phone: member.phone
      })));
      setApiState({ status: "live", message: "" });
    } catch (error) {
      setApiState({
        status: error.status === 401 ? "sample" : "error",
        message: error.status === 401
          ? "Sign in to load this dashboard from PostgreSQL."
          : getApiErrorMessage(error)
      });
    }
  }

  useEffect(() => {
    loadProviderData();
  }, [business]);

  function chooseSection(id) {
    setActiveSection(id);
    setSidebarOpen(false);
    setNotice("");
  }

  async function logOut() {
    if (apiState.status === "live") {
      try {
        await apiRequest("/auth/logout", { method: "POST" });
      } catch (error) {
        setNotice(getApiErrorMessage(error));
        return;
      }
    }
    onNavigate("/");
  }

  function addActivity(text, detail, tone = "lavender") {
    setActivities((current) => [
      { id: Date.now(), text, detail, time: "Just now", tone },
      ...current
    ]);
  }

  function startNewService() {
    setEditingServiceId(null);
    setServiceDraft({
      name: "", category: "", description: "", priceType: "fixed",
      price: "", maxPrice: "", areas: "", pins: ""
    });
    setShowServiceForm(true);
  }

  function editService(service) {
    setEditingServiceId(service.id);
    setServiceDraft({ ...service });
    setShowServiceForm(true);
  }

  async function saveService(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const areaList = serviceDraft.areas.split(",").map((area) => area.trim()).filter(Boolean);
    const pinList = serviceDraft.pins.split(",").map((pin) => pin.trim()).filter(Boolean);
    if (areaList.length === 0 || pinList.length === 0) {
      setNotice("Add at least one service area and one PIN code, separated by commas.");
      return;
    }
    if (serviceDraft.priceType === "range" && Number(serviceDraft.maxPrice) < Number(serviceDraft.price)) {
      setNotice("The maximum estimate must be greater than or equal to the minimum.");
      return;
    }
    if (apiState.status === "live") {
      const category = apiCategories.find((item) => item.name.toLowerCase() === serviceDraft.category.toLowerCase());
      const city = profile.city || "Hyderabad";
      const areas = areaList.map((locality, index) => ({
        city,
        locality,
        pinCode: pinList[Math.min(index, pinList.length - 1)]
      }));
      if (!category) {
        setNotice("Select a category that is active in the database.");
        return;
      }
      if (areas.some((area) => !/^\d{6}$/.test(area.pinCode))) {
        setNotice("Enter a six-digit PIN code for every service area.");
        return;
      }
      try {
        const body = {
          name: serviceDraft.name,
          categoryId: Number(category.id),
          description: serviceDraft.description,
          pricingType: serviceDraft.priceType.toUpperCase(),
          priceMin: Number(serviceDraft.price),
          priceMax: serviceDraft.priceType === "range" ? Number(serviceDraft.maxPrice) : null,
          durationMinutes: 60,
          active: true,
          areas
        };
        await apiRequest(
          editingServiceId ? `/services/${editingServiceId}` : "/services",
          { method: editingServiceId ? "PATCH" : "POST", body }
        );
        await loadProviderData();
        addActivity(editingServiceId ? "Service listing updated" : "New service listing added", serviceDraft.name);
        setShowServiceForm(false);
        setEditingServiceId(null);
        setNotice("Service saved to your SETHU account.");
      } catch (error) {
        setNotice(getApiErrorMessage(error));
      }
      return;
    }
    const savedService = { ...serviceDraft, id: editingServiceId ?? Date.now() };
    setServices((current) => editingServiceId
      ? current.map((service) => service.id === editingServiceId ? savedService : service)
      : [savedService, ...current]
    );
    addActivity(
      editingServiceId ? "Service listing updated" : "New service listing added",
      savedService.name
    );
    setShowServiceForm(false);
    setEditingServiceId(null);
    setNotice(editingServiceId ? "Service updated in this prototype." : "Service added in this prototype.");
  }

  async function deleteService(service) {
    if (apiState.status === "live") {
      try {
        await apiRequest(`/services/${service.id}`, { method: "DELETE" });
        await loadProviderData();
        addActivity("Service listing removed", service.name, "peach");
        setNotice("Service removed from your SETHU account.");
      } catch (error) {
        setNotice(getApiErrorMessage(error));
      }
      return;
    }
    setServices((current) => current.filter((item) => item.id !== service.id));
    addActivity("Service listing removed", service.name, "peach");
    setNotice("Service removed from the sample dashboard.");
  }

  async function updateRequestStatus(request, status) {
    if (apiState.status === "live") {
      try {
        await apiRequest(`/requests/${request.requestId}/status`, {
          method: "PATCH",
          body: { status: status.toUpperCase() }
        });
        await loadProviderData();
        addActivity(
          status === "Accepted" ? "Service request accepted" : "Service request rejected",
          `${request.service} · ${request.customer}`,
          status === "Accepted" ? "mint" : "peach"
        );
        setNotice(`${request.id} marked ${status.toLowerCase()}.`);
      } catch (error) {
        setNotice(getApiErrorMessage(error));
      }
      return;
    }
    setRequests((current) => current.map((item) =>
      item.id === request.id ? { ...item, status } : item
    ));
    addActivity(
      status === "Accepted" ? "Service request accepted" : "Service request rejected",
      `${request.service} · ${request.customer}`,
      status === "Accepted" ? "mint" : "peach"
    );
    setNotice(`${request.id} marked ${status.toLowerCase()} in this prototype.`);
  }

  async function updateBookingStatus(request, status) {
    if (apiState.status === "live") {
      try {
        await apiRequest(`/bookings/${request.bookingId}/status`, {
          method: "PATCH",
          body: { status: status.toUpperCase().replaceAll(" ", "_") }
        });
        await loadProviderData();
        setNotice(`${request.service} marked ${status.toLowerCase()}.`);
      } catch (error) {
        setNotice(getApiErrorMessage(error));
      }
      return;
    }
    setRequests((current) => current.map((item) =>
      item.id === request.id ? { ...item, status } : item
    ));
    addActivity(
      status === "Completed" ? "Job marked completed" : "Job started",
      `${request.service} · ${request.customer}`,
      status === "Completed" ? "mint" : "lavender"
    );
    setNotice(`${request.service} marked ${status.toLowerCase()} in this prototype.`);
  }

  async function saveAvailability(event) {
    event.preventDefault();
    if (!workingDays.length) {
      setNotice("Select at least one working day.");
      return;
    }
    if (workingHours.start >= workingHours.end) {
      setNotice("Your end time must be later than your start time.");
      return;
    }
    if (apiState.status === "live") {
      const days = workingDays.map((day) => {
        const mondayBasedIndex = weekDays.indexOf(day);
        return { weekday: (mondayBasedIndex + 1) % 7, startTime: workingHours.start, endTime: workingHours.end };
      });
      try {
        await apiRequest("/availability", {
          method: "PUT",
          body: { days, appointmentMinutes: Number(appointmentDuration) }
        });
        await loadProviderData();
        setNotice("Availability preferences saved to your SETHU account.");
      } catch (error) {
        setNotice(getApiErrorMessage(error));
      }
      return;
    }
    setNotice("Availability preferences updated in this prototype.");
    addActivity("Availability schedule updated", `${workingDays.length} working days`);
  }

  async function addBlockedSlot(event) {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    if (blockedSlots.some((slot) => slot.date === blockDraft.date && slot.time === blockDraft.time)) {
      setNotice("That date and time are already blocked.");
      return;
    }
    if (apiState.status === "live") {
      const parseTime = (label) => {
        const match = label.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
        if (!match) return null;
        const hour = Number(match[1]) % 12 + (match[3].toUpperCase() === "PM" ? 12 : 0);
        return `${String(hour).padStart(2, "0")}:${match[2]}`;
      };
      const [startLabel, endLabel] = blockDraft.time.split(" – ");
      const startTime = blockDraft.time === "All day" ? "00:00" : parseTime(startLabel);
      const endTime = blockDraft.time === "All day" ? "00:00" : parseTime(endLabel);
      if (!startTime || !endTime) {
        setNotice("Choose a valid time slot.");
        return;
      }
      const startsAt = new Date(`${blockDraft.date}T${startTime}:00`);
      const endsAt = blockDraft.time === "All day"
        ? new Date(startsAt.getTime() + 24 * 60 * 60 * 1000)
        : new Date(`${blockDraft.date}T${endTime}:00`);
      if (endsAt <= startsAt) {
        setNotice("The blocked time must end after it starts.");
        return;
      }
      try {
        await apiRequest("/availability/blocked-slots", {
          method: "POST",
          body: { startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() }
        });
        await loadProviderData();
        setBlockDraft({ date: "", time: "" });
        setNotice("Unavailable time saved to your SETHU schedule.");
      } catch (error) {
        setNotice(getApiErrorMessage(error));
      }
      return;
    }
    setBlockedSlots((current) => [...current, { ...blockDraft, id: Date.now() }]);
    addActivity("Unavailable time blocked", `${blockDraft.date} · ${blockDraft.time}`, "peach");
    setBlockDraft({ date: "", time: "" });
    setNotice("Unavailable time added to your sample schedule.");
  }

  async function saveProfile(event) {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    if (apiState.status === "live") {
      const areas = profileDraft.areas.split(",").map((area) => area.trim()).filter(Boolean);
      const pin = profileDraft.pin || "";
      if (business && (!profileDraft.city || !/^\d{6}$/.test(pin))) {
        setNotice("Enter a city and six-digit PIN code for the business address.");
        return;
      }
      if (areas.length && (!profileDraft.city || !/^\d{6}$/.test(pin))) {
        setNotice("Enter a city and six-digit PIN code for your service areas.");
        return;
      }
      try {
        await apiRequest("/profile", {
          method: "PATCH",
          body: {
            name: profileDraft.name,
            email: profileDraft.email,
            phone: profileDraft.phone,
            description: profileDraft.description || "",
            experienceYears: Number(profileDraft.experience || 0),
            businessName: business ? profileDraft.name : undefined,
            address: profileDraft.address || "",
            city: profileDraft.city || "",
            locality: profileDraft.locality || "",
            pinCode: pin,
            categories: profileDraft.categories.split(",").map((category) => category.trim()).filter(Boolean),
            serviceAreas: areas.map((locality) => ({ city: profileDraft.city, locality, pinCode: pin }))
          }
        });
        if (businessLogoFile) {
          const form = new FormData();
          form.set("logo", businessLogoFile);
          await apiRequest("/profile/logo", { method: "POST", body: form });
          setBusinessLogoFile(null);
        }
        await loadProviderData();
        setEditingProfile(false);
        addActivity(business ? "Business profile updated" : "Provider profile updated", "Profile changes are saved");
        setNotice("Profile changes were saved to your SETHU account.");
      } catch (error) {
        setNotice(getApiErrorMessage(error));
      }
      return;
    }
    setProfile(profileDraft);
    setEditingProfile(false);
    addActivity(
      business ? "Business profile updated" : "Provider profile updated",
      "Profile changes are session-only"
    );
    setNotice(`${business ? "Business" : "Profile"} changes are shown in this prototype only; nothing has been saved to a server.`);
  }

  function handleLogoChange(event) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setNotice("Choose an image file for your business logo.");
      event.currentTarget.value = "";
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setNotice("Business logo must be 2 MB or smaller.");
      event.currentTarget.value = "";
      return;
    }
    setBusinessLogoFile(file);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setProfileDraft((current) => ({ ...current, logo: reader.result }));
      } else {
        setNotice("The selected business logo could not be read.");
      }
    };
    reader.onerror = () => setNotice("The selected business logo could not be read.");
    reader.readAsDataURL(file);
  }

  async function addStaffMember(event) {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    if (apiState.status === "live") {
      try {
        await apiRequest("/team", { method: "POST", body: staffDraft });
        await loadProviderData();
        setStaffDraft({ name: "", role: "", email: "" });
        setShowStaffForm(false);
        setNotice("Team member saved to your business account.");
      } catch (error) {
        setNotice(getApiErrorMessage(error));
      }
      return;
    }
    const newMember = { ...staffDraft, id: Date.now() };
    setStaff((current) => [newMember, ...current]);
    setStaffDraft({ name: "", role: "", email: "" });
    setShowStaffForm(false);
    addActivity("Team member added", newMember.name, "mint");
    setNotice(`${newMember.name} was added to the sample team.`);
  }

  async function removeStaffMember(member) {
    if (apiState.status === "live") {
      try {
        await apiRequest(`/team/${member.id}`, { method: "DELETE" });
        await loadProviderData();
        setNotice(`${member.name} was removed from your team.`);
      } catch (error) {
        setNotice(getApiErrorMessage(error));
      }
      return;
    }
    setStaff((current) => current.filter((item) => item.id !== member.id));
    addActivity("Team member removed", member.name, "peach");
    setNotice(`${member.name} was removed from the sample team.`);
  }

  function renderStatus(status) {
    return <span className={`request-status status-${status.toLowerCase().replaceAll(" ", "-")}`}>{status}</span>;
  }

  return (
    <div className={`customer-dashboard provider-dashboard ${business ? "business-dashboard" : ""}`}>
      {sidebarOpen && (
        <button className="dashboard-sidebar-backdrop" onClick={() => setSidebarOpen(false)} aria-label="Close dashboard navigation" />
      )}
      <aside className={`dashboard-sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
        <a
          className="brand dashboard-brand"
          href="/"
          onClick={(event) => {
            event.preventDefault();
            onNavigate("/");
          }}
          aria-label="SETHU home"
        >
          <span className="brand-mark">S</span>
          <span>SETHU<span className="brand-dot">.</span></span>
        </a>
        <div className="dashboard-sidebar-label">{business ? "BUSINESS MENU" : "PROVIDER MENU"}</div>
        <nav className="dashboard-navigation" aria-label={business ? "Business dashboard" : "Provider dashboard"}>
          {navigation.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`dashboard-nav-item ${activeSection === id ? "active" : ""}`}
              onClick={() => chooseSection(id)}
              aria-current={activeSection === id ? "page" : undefined}
            >
              <Icon size={18} />
              <span>{label}</span>
              {id === "requests" && pendingRequestCount > 0 && (
                <span className="provider-nav-count">{pendingRequestCount}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="dashboard-sidebar-bottom">
          <div className="dashboard-sidebar-help">
            <ShieldCheck size={18} />
            <span><strong>{business ? "Grow your business" : "Grow your local service"}</strong><small>SETHU {business ? "business" : "provider"} portal</small></span>
          </div>
          <button className="dashboard-nav-item dashboard-logout" onClick={logOut}>
            <LogOut size={18} /><span>Logout</span>
          </button>
          <span className="dashboard-version">SETHU · Prototype</span>
        </div>
      </aside>

      <main className="dashboard-main">
        <header className="dashboard-topbar">
          <button className="dashboard-mobile-menu" onClick={() => setSidebarOpen(true)} aria-label="Open dashboard navigation">
            <Menu size={21} />
          </button>
          <div className="dashboard-breadcrumb">
            <span>{business ? "Business portal" : "Provider portal"}</span><ChevronRight size={14} /><strong>{sectionTitle}</strong>
          </div>
          <div className="dashboard-topbar-user">
            <span className="dashboard-topbar-greeting">{business ? "Business," : "Provider,"}</span>
            <span className="dashboard-topbar-name">{profile.name.split(" ")[0]}</span>
            <span className="dashboard-user-avatar">{profile.name.split(" ").map((part) => part[0]).join("").slice(0, 2)}</span>
          </div>
        </header>

        <div className="dashboard-content">
          <div className="dashboard-page-heading">
            <div>
              <span className="dashboard-eyebrow">{business ? "BUSINESS SERVICE PROVIDER" : "INDIVIDUAL SERVICE PROVIDER"}</span>
              <h1>{activeSection === "dashboard" ? `Welcome, ${profile.name.split(" ")[0]}!` : sectionTitle}</h1>
              <p>{activeSection === "dashboard" ? "Here’s what’s happening with your services today." : sectionSubtitle}</p>
            </div>
            {activeSection === "dashboard" && (
              <button className="primary-btn provider-add-service-top" onClick={() => {
                chooseSection("services");
                startNewService();
              }}><Plus size={16} /> Add Service</button>
            )}
          </div>

          {notice && (
            <div className="dashboard-notice" role="status">
              <span>{notice}</span>
              <button onClick={() => setNotice("")} aria-label="Dismiss message"><X size={16} /></button>
            </div>
          )}

          {apiState.status !== "live" && (
            <div className="dashboard-notice provider-api-notice" role={apiState.status === "error" ? "alert" : "status"}>
              <span>{apiState.status === "loading" ? "Connecting to your SETHU account…" : apiState.status === "sample" ? `Sample preview: ${apiState.message}` : `Live account data is unavailable: ${apiState.message}`}</span>
              {apiState.status === "sample"
                ? <button className="dashboard-link-btn" onClick={() => onNavigate("/login")}>Sign in</button>
                : apiState.status === "error" && <button className="dashboard-link-btn" onClick={loadProviderData}>Retry</button>}
            </div>
          )}

          {activeSection === "dashboard" && (
            <>
              <section className="provider-summary-grid" aria-label={business ? "Business summary" : "Provider summary"}>
                {[
                  { label: "Total Services", value: services.length, icon: Wrench, tone: "lavender", note: "Active listings" },
                  { label: "Pending Requests", value: pendingRequestCount, icon: ClipboardList, tone: "peach", note: "Need your response" },
                  { label: business ? "Confirmed Bookings" : "Accepted Bookings", value: acceptedBookingCount, icon: CalendarDays, tone: "sky", note: "Upcoming or active" },
                  { label: "Completed Jobs", value: completedJobCount, icon: Check, tone: "mint", note: "Successfully finished" },
                  { label: "Average Rating", value: averageRating, icon: Star, tone: "pink", note: `${reviewData.length} sample reviews` }
                ].map(({ label, value, icon: Icon, tone, note }) => (
                  <article className="provider-summary-card" key={label}>
                    <span className={`provider-summary-icon ${tone}`}><Icon size={18} /></span>
                    <span className="provider-summary-label">{label}</span>
                    <strong>{value}</strong>
                    <small>{note}</small>
                  </article>
                ))}
              </section>

              <div className="provider-dashboard-columns">
                <section className="dashboard-panel provider-activity-panel">
                  <div className="dashboard-section-heading">
                    <div><h2>Recent activity</h2><p>Latest updates across your sample account.</p></div>
                    <span className="dashboard-count-chip">Recent</span>
                  </div>
                  <div className="provider-activity-list">
                    {activities.slice(0, 6).map((activity) => (
                      <article className="provider-activity-item" key={activity.id}>
                        <span className={`provider-activity-icon ${activity.tone}`}><Clock3 size={16} /></span>
                        <div><strong>{activity.text}</strong><p>{activity.detail}</p><small>{activity.time}</small></div>
                      </article>
                    ))}
                  </div>
                </section>
                <section className="dashboard-panel provider-next-panel">
                  <div className="dashboard-section-heading">
                    <div><h2>Needs your attention</h2><p>Requests waiting for a response.</p></div>
                    <button className="dashboard-link-btn" onClick={() => chooseSection("requests")}>View requests <ArrowRight size={14} /></button>
                  </div>
                  {requests.filter((request) => request.status === "Pending").slice(0, 3).map((request) => (
                    <div className="provider-attention-row" key={request.id}>
                      <span className="provider-attention-dot" />
                      <span><strong>{request.service}</strong><small>{request.customer} · {request.locality}</small></span>
                      {request.type === "Urgent" && <em>Urgent</em>}
                    </div>
                  ))}
                  {pendingRequestCount === 0 && <p className="provider-no-pending">You’re all caught up on service requests.</p>}
                  <div className="provider-rating-highlight">
                    <Star size={18} fill="currentColor" />
                    <span><strong>{averageRating} / 5</strong><small>Average customer rating</small></span>
                  </div>
                </section>
              </div>
              {business && (
                <section className="dashboard-panel business-recent-requests">
                  <div className="dashboard-section-heading">
                    <div><h2>Recent requests</h2><p>Latest customer requests for your business.</p></div>
                    <button className="dashboard-link-btn" onClick={() => chooseSection("requests")}>View all <ArrowRight size={14} /></button>
                  </div>
                  <div className="provider-request-list">
                    {requests.slice(0, 3).map((request) => (
                      <article className="provider-request-card" key={request.id}>
                        <div className="provider-request-main">
                          <span className={`provider-request-service-icon ${request.type === "Urgent" ? "urgent" : ""}`}><Wrench size={18} /></span>
                          <div className="provider-request-details">
                            <div className="provider-request-heading"><h3>{request.service}</h3>{renderStatus(request.status)}</div>
                            <p><strong>{request.customer}</strong> · {request.locality}</p>
                            <div className="provider-request-meta"><span><CalendarDays size={14} />{request.date}</span><span><Clock3 size={14} />{request.time}</span><span className={`provider-request-type ${request.type.toLowerCase()}`}>{request.type}</span></div>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              )}
              <p className="dashboard-sample-note">{apiState.status === "live" ? "Dashboard data is loaded from your SETHU account. Updates are saved to the database." : "Summary and activity are sample data. Changes are kept in frontend state only."}</p>
            </>
          )}

          {activeSection === "services" && (
            <section className="dashboard-panel provider-services-panel">
              <div className="dashboard-section-heading">
                <div><h2>Your service listings</h2><p>Prices, descriptions and service areas shown here are sample data.</p></div>
                {!showServiceForm && <button className="primary-btn provider-compact-btn" onClick={startNewService}><Plus size={15} /> Add Service</button>}
              </div>

              {showServiceForm && (
                <form className="provider-form-card" onSubmit={saveService}>
                  <div className="provider-form-heading">
                    <h3>{editingServiceId ? "Edit service" : "Add a service"}</h3>
                    <button type="button" className="provider-form-close" onClick={() => setShowServiceForm(false)} aria-label="Close service form"><X size={17} /></button>
                  </div>
                  <div className="provider-form-grid">
                    <label className="provider-form-field"><span>Service name</span><input value={serviceDraft.name} onChange={(event) => setServiceDraft({ ...serviceDraft, name: event.target.value })} placeholder="e.g. Tap and pipe repairs" minLength="2" required /></label>
                    <label className="provider-form-field"><span>Service category</span><select value={serviceDraft.category} onChange={(event) => setServiceDraft({ ...serviceDraft, category: event.target.value })} required><option value="" disabled>Select a category</option>{serviceCategoryOptions.map((category) => <option key={category}>{category}</option>)}</select></label>
                    <label className="provider-form-field provider-form-full"><span>Description</span><textarea value={serviceDraft.description} onChange={(event) => setServiceDraft({ ...serviceDraft, description: event.target.value })} placeholder="Describe the service you provide" minLength="10" rows="3" required /></label>
                    <label className="provider-form-field"><span>Price type</span><select value={serviceDraft.priceType} onChange={(event) => setServiceDraft({ ...serviceDraft, priceType: event.target.value })}><option value="fixed">Fixed price</option><option value="range">Estimated price range</option></select></label>
                    <label className="provider-form-field"><span>{serviceDraft.priceType === "fixed" ? "Price (₹)" : "Minimum estimate (₹)"}</span><input type="number" value={serviceDraft.price} onChange={(event) => setServiceDraft({ ...serviceDraft, price: event.target.value })} min="1" step="1" required /></label>
                    {serviceDraft.priceType === "range" && <label className="provider-form-field"><span>Maximum estimate (₹)</span><input type="number" value={serviceDraft.maxPrice} onChange={(event) => setServiceDraft({ ...serviceDraft, maxPrice: event.target.value })} min={serviceDraft.price || "1"} step="1" required /></label>}
                    <label className="provider-form-field provider-form-full"><span>Service areas / localities</span><input value={serviceDraft.areas} onChange={(event) => setServiceDraft({ ...serviceDraft, areas: event.target.value })} placeholder="Madhapur, Kondapur (separate with commas)" required /></label>
                    <label className="provider-form-field provider-form-full"><span>PIN codes</span><input value={serviceDraft.pins} onChange={(event) => setServiceDraft({ ...serviceDraft, pins: event.target.value })} placeholder="500081, 500084 (separate with commas)" pattern="[0-9 ,]{4,}" title="Enter one or more PIN codes separated by commas." required /></label>
                  </div>
                  <p className="provider-form-hint">Enter multiple areas and PIN codes separated by commas.</p>
                  <div className="dashboard-profile-actions">
                    <button className="primary-btn" type="submit"><Check size={15} /> {editingServiceId ? "Save changes" : "Add service"}</button>
                    <button className="dashboard-cancel-btn" type="button" onClick={() => setShowServiceForm(false)}>Cancel</button>
                  </div>
                </form>
              )}

              <div className="provider-service-list">
                {services.map((service) => (
                  <article className="provider-service-card" key={service.id}>
                    <div className="provider-service-card-main">
                      <span className="provider-service-icon"><Wrench size={19} /></span>
                      <div><span className="provider-service-category">{service.category}</span><h3>{service.name}</h3><p>{service.description}</p></div>
                    </div>
                    <div className="provider-service-meta">
                      <span><strong>Price</strong>{service.priceType === "fixed" ? `₹${service.price} fixed` : `₹${service.price}–₹${service.maxPrice} estimate`}</span>
                      <span><strong>Areas</strong>{service.areas}</span>
                      <span><strong>PIN codes</strong>{service.pins}</span>
                    </div>
                    <div className="provider-service-actions">
                      <button className="dashboard-outline-btn" onClick={() => editService(service)}><Pencil size={14} /> Edit</button>
                      <button className="provider-delete-btn" onClick={() => deleteService(service)}><Trash2 size={14} /> Delete</button>
                    </div>
                  </article>
                ))}
                {services.length === 0 && <div className="dashboard-empty-state"><Wrench size={24} /><strong>No services listed yet</strong><span>Add a service to show customers what you offer.</span><button className="primary-btn provider-compact-btn" onClick={startNewService}><Plus size={15} /> Add Service</button></div>}
              </div>
            </section>
          )}

          {activeSection === "requests" && (
            <section className="dashboard-panel provider-requests-panel">
              <div className="dashboard-section-heading">
                <div><h2>Customer requests</h2><p>Accept or reject pending sample requests. Decisions update this page only.</p></div>
                <span className="dashboard-count-chip">{pendingRequestCount} pending</span>
              </div>
              <div className="provider-request-list">
                {requests.map((request) => (
                  <article className="provider-request-card" key={request.id}>
                    <div className="provider-request-main">
                      <span className={`provider-request-service-icon ${request.type === "Urgent" ? "urgent" : ""}`}><Wrench size={19} /></span>
                      <div className="provider-request-details">
                        <div className="provider-request-heading"><h3>{request.service}</h3>{renderStatus(request.status)}</div>
                        <p><strong>{request.customer}</strong> · {request.id}</p>
                        <div className="provider-request-meta">
                          <span><MapPin size={14} />{request.locality}</span>
                          <span><CalendarDays size={14} />{request.date}</span>
                          <span><Clock3 size={14} />{request.time}</span>
                          <span className={`provider-request-type ${request.type.toLowerCase()}`}>{request.type}</span>
                        </div>
                      </div>
                    </div>
                    {request.status === "Pending" && (
                      <div className="provider-request-actions">
                        <button className="primary-btn" onClick={() => updateRequestStatus(request, "Accepted")}><Check size={15} /> Accept</button>
                        <button className="provider-reject-btn" onClick={() => updateRequestStatus(request, "Rejected")}><X size={15} /> Reject</button>
                      </div>
                    )}
                  </article>
                ))}
              </div>
              <p className="dashboard-sample-note">Customer names and request details are sample data.</p>
            </section>
          )}

          {activeSection === "availability" && (
            <div className="provider-availability-layout">
              <section className="dashboard-panel">
                <div className="dashboard-section-heading"><div><h2>Working schedule</h2><p>Choose your usual work days and hours.</p></div></div>
                <form className="provider-availability-form" onSubmit={saveAvailability}>
                  <fieldset className="provider-days-field">
                    <legend>Working days</legend>
                    <div className="provider-day-options">
                      {weekDays.map((day) => (
                        <label className={`provider-day-option ${workingDays.includes(day) ? "selected" : ""}`} key={day}>
                          <input type="checkbox" checked={workingDays.includes(day)} onChange={(event) => setWorkingDays((current) => event.target.checked ? [...current, day] : current.filter((item) => item !== day))} />
                          <span>{day.slice(0, 3)}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <div className="provider-hours-row">
                    <label className="provider-form-field"><span>Start time</span><input type="time" value={workingHours.start} onChange={(event) => setWorkingHours({ ...workingHours, start: event.target.value })} required /></label>
                    <label className="provider-form-field"><span>End time</span><input type="time" value={workingHours.end} onChange={(event) => setWorkingHours({ ...workingHours, end: event.target.value })} required /></label>
                  </div>
                  <label className="provider-form-field"><span>Appointment duration</span><select value={appointmentDuration} onChange={(event) => setAppointmentDuration(event.target.value)}><option value="30">30 minutes</option><option value="60">1 hour</option><option value="90">1 hour 30 minutes</option><option value="120">2 hours</option></select></label>
                  <button className="primary-btn provider-save-availability" type="submit"><Check size={15} /> Save schedule</button>
                </form>
              </section>

              <section className="dashboard-panel provider-blocked-panel">
                <div className="dashboard-section-heading"><div><h2>Unavailable dates & times</h2><p>Block time off or reopen it when plans change.</p></div><span className="dashboard-count-chip">{blockedSlots.length} blocked</span></div>
                <form className="provider-block-form" onSubmit={addBlockedSlot}>
                  <label className="provider-form-field"><span>Date</span><input type="date" min={new Date().toISOString().slice(0, 10)} value={blockDraft.date} onChange={(event) => setBlockDraft({ ...blockDraft, date: event.target.value })} required /></label>
                  <label className="provider-form-field"><span>Time slot</span><select value={blockDraft.time} onChange={(event) => setBlockDraft({ ...blockDraft, time: event.target.value })} required><option value="" disabled>Select a time</option><option>All day</option><option>9:00 AM – 11:00 AM</option><option>11:00 AM – 1:00 PM</option><option>1:00 PM – 3:00 PM</option><option>3:00 PM – 5:00 PM</option><option>5:00 PM – 7:00 PM</option></select></label>
                  <button className="primary-btn provider-block-submit" type="submit"><Plus size={15} /> Block time</button>
                </form>
                <div className="provider-blocked-list">
                  {blockedSlots.map((slot) => (
                    <article className="provider-blocked-item" key={slot.id}>
                      <span className="provider-blocked-icon"><CalendarDays size={16} /></span>
                      <span><strong>{new Date(`${slot.date}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</strong><small>{slot.time}</small></span>
                      <button className="provider-reopen-btn" onClick={async () => {
                        if (apiState.status === "live") {
                          try {
                            await apiRequest(`/availability/blocked-slots/${slot.id}`, { method: "DELETE" });
                            await loadProviderData();
                            setNotice("Blocked time reopened in your SETHU schedule.");
                          } catch (error) {
                            setNotice(getApiErrorMessage(error));
                          }
                        } else {
                          setBlockedSlots((current) => current.filter((item) => item.id !== slot.id));
                          setNotice("Blocked time reopened in your sample schedule.");
                        }
                      }}>Reopen</button>
                    </article>
                  ))}
                  {blockedSlots.length === 0 && <p className="provider-no-pending">No unavailable times are blocked.</p>}
                </div>
              </section>
            </div>
          )}

          {activeSection === "bookings" && (
            <section className="dashboard-panel provider-bookings-panel">
              <div className="dashboard-section-heading"><div><h2>My bookings</h2><p>Accepted and active jobs, followed by completed work.</p></div><span className="dashboard-count-chip">{bookings.length} bookings</span></div>
              <div className="provider-booking-list">
                {bookings.map((booking) => (
                  <article className="provider-booking-card" key={booking.id}>
                    <div className="provider-booking-main"><span className="provider-booking-icon"><CalendarDays size={18} /></span><div><div className="provider-request-heading"><h3>{booking.service}</h3>{renderStatus(booking.status)}</div><p>{booking.customer} · {booking.locality}</p><small>{booking.date} · {booking.time} · {booking.id}</small></div></div>
                    {booking.status === "Accepted" && <button className="dashboard-outline-btn" onClick={() => updateBookingStatus(booking, "In Progress")}>Start job <ArrowRight size={14} /></button>}
                    {booking.status === "In Progress" && <button className="primary-btn provider-compact-btn" onClick={() => updateBookingStatus(booking, "Completed")}><Check size={14} /> Mark complete</button>}
                  </article>
                ))}
                {bookings.length === 0 && <div className="dashboard-empty-state"><CalendarDays size={24} /><strong>No bookings yet</strong><span>Accepted service requests will appear here.</span></div>}
              </div>
              <p className="dashboard-sample-note">{apiState.status === "live" ? "Bookings are loaded from your account and status changes are saved." : "Bookings are derived from sample service requests and their current status."}</p>
            </section>
          )}

          {activeSection === "reviews" && (
            <section className="dashboard-panel provider-reviews-panel">
              <div className="provider-review-summary">
                <div><span className="dashboard-eyebrow">CUSTOMER FEEDBACK</span><h2>{averageRating}<span> / 5</span></h2><div className="provider-stars">{[1, 2, 3, 4, 5].map((star) => <Star key={star} size={16} fill={star <= Math.round(Number(averageRating)) ? "currentColor" : "none"} />)}</div><p>Based on {reviewData.length} sample customer reviews</p></div>
                <span className="provider-review-summary-icon"><Star size={30} fill="currentColor" /></span>
              </div>
              <div className="provider-review-list">
                {reviewData.map((review, index) => (
                  <article className="provider-review-card" key={`${review.name}-${review.date}`}>
                    <div className="provider-review-avatar">{review.name.split(" ").map((part) => part[0]).join("").slice(0, 2)}</div>
                    <div className="provider-review-content">
                      <div className="provider-review-heading"><div><strong>{review.name}</strong><small>{review.service} · {review.date}</small></div><span className="provider-review-rating"><Star size={13} fill="currentColor" /> {review.rating}.0</span></div>
                      <p>“{review.text}”</p>
                    </div>
                  </article>
                ))}
              </div>
              <p className="dashboard-sample-note">Reviews are sample data for dashboard preview only.</p>
            </section>
          )}

          {activeSection === "profile" && (
            <section className="dashboard-panel provider-profile-panel">
              <div className="dashboard-section-heading"><div><h2>{business ? "Business details" : "Provider profile"}</h2><p>Profile details are sample data and remain in this browser session.</p></div>{!editingProfile && <button className="dashboard-outline-btn" onClick={() => { setProfileDraft(profile); setEditingProfile(true); }}><Pencil size={14} /> Edit {business ? "Business" : "Profile"}</button>}</div>
              {editingProfile ? (
                business ? (
                  <form className="provider-profile-form business-profile-form" onSubmit={saveProfile}>
                    <div className="business-logo-editor">
                      <span className="business-logo-preview">
                        {profileDraft.logo ? <img src={profileDraft.logo} alt="Business logo preview" /> : <Building2 size={26} />}
                      </span>
                      <label className="provider-form-field"><span><Upload size={13} /> Business logo</span><input type="file" accept="image/*" onChange={handleLogoChange} /><small>Choose an image up to 2 MB. It stays in this browser session.</small></label>
                    </div>
                    <label className="provider-form-field"><span>Business name</span><input value={profileDraft.name} onChange={(event) => setProfileDraft({ ...profileDraft, name: event.target.value })} minLength="2" required /></label>
                    <label className="provider-form-field"><span>Email address</span><input type="email" value={profileDraft.email} onChange={(event) => setProfileDraft({ ...profileDraft, email: event.target.value })} required /></label>
                    <label className="provider-form-field"><span>Phone number</span><input type="tel" value={profileDraft.phone} onChange={(event) => setProfileDraft({ ...profileDraft, phone: event.target.value })} pattern="[+]?[0-9]{7,15}" title="Enter 7 to 15 digits, with an optional leading +." required /></label>
                    <label className="provider-form-field"><span>Experience (years)</span><input type="number" value={profileDraft.experience} onChange={(event) => setProfileDraft({ ...profileDraft, experience: event.target.value })} min="0" max="80" required /></label>
                    <label className="provider-form-field provider-form-full"><span>Business description</span><textarea value={profileDraft.description} onChange={(event) => setProfileDraft({ ...profileDraft, description: event.target.value })} rows="3" minLength="10" required /></label>
                    <label className="provider-form-field provider-form-full"><span>Business address</span><input value={profileDraft.address} onChange={(event) => setProfileDraft({ ...profileDraft, address: event.target.value })} required /></label>
                    <label className="provider-form-field"><span>City</span><input value={profileDraft.city} onChange={(event) => setProfileDraft({ ...profileDraft, city: event.target.value })} required /></label>
                    <label className="provider-form-field"><span>Locality</span><input value={profileDraft.locality} onChange={(event) => setProfileDraft({ ...profileDraft, locality: event.target.value })} required /></label>
                    <label className="provider-form-field"><span>PIN code</span><input value={profileDraft.pin} onChange={(event) => setProfileDraft({ ...profileDraft, pin: event.target.value })} pattern="[0-9]{6}" title="Enter a 6-digit PIN code." required /></label>
                    <label className="provider-form-field"><span>Service categories</span><input value={profileDraft.categories} onChange={(event) => setProfileDraft({ ...profileDraft, categories: event.target.value })} required /></label>
                    <label className="provider-form-field provider-form-full"><span>Service areas</span><textarea value={profileDraft.areas} onChange={(event) => setProfileDraft({ ...profileDraft, areas: event.target.value })} rows="2" required /></label>
                    <div className="dashboard-profile-actions provider-form-full"><button className="primary-btn" type="submit"><Check size={15} /> Save Business Profile</button><button className="dashboard-cancel-btn" type="button" onClick={() => { setProfileDraft(profile); setEditingProfile(false); }}>Cancel</button></div>
                  </form>
                ) : (
                <form className="provider-profile-form" onSubmit={saveProfile}>
                  <label className="provider-form-field"><span>Provider name</span><input value={profileDraft.name} onChange={(event) => setProfileDraft({ ...profileDraft, name: event.target.value })} minLength="2" required /></label>
                  <label className="provider-form-field"><span>Email address</span><input type="email" value={profileDraft.email} onChange={(event) => setProfileDraft({ ...profileDraft, email: event.target.value })} required /></label>
                  <label className="provider-form-field"><span>Phone number</span><input type="tel" value={profileDraft.phone} onChange={(event) => setProfileDraft({ ...profileDraft, phone: event.target.value })} pattern="[+]?[0-9]{7,15}" title="Enter 7 to 15 digits, with an optional leading +." required /></label>
                  <label className="provider-form-field"><span>Experience (years)</span><input type="number" value={profileDraft.experience} onChange={(event) => setProfileDraft({ ...profileDraft, experience: event.target.value })} min="0" max="80" required /></label>
                  <label className="provider-form-field provider-form-full"><span>Service categories</span><input value={profileDraft.categories} onChange={(event) => setProfileDraft({ ...profileDraft, categories: event.target.value })} placeholder="Plumbing, Home Repairs" required /></label>
                  <label className="provider-form-field provider-form-full"><span>Service areas</span><textarea value={profileDraft.areas} onChange={(event) => setProfileDraft({ ...profileDraft, areas: event.target.value })} rows="2" required /></label>
                  <div className="dashboard-profile-actions provider-form-full"><button className="primary-btn" type="submit"><Check size={15} /> Save Profile</button><button className="dashboard-cancel-btn" type="button" onClick={() => setEditingProfile(false)}>Cancel</button></div>
                </form>
                )
              ) : (
                business ? (
                  <div className="provider-profile-details business-profile-details">
                    <span className="business-logo-preview business-profile-logo">{profile.logo ? <img src={profile.logo} alt={`${profile.name} logo`} /> : <Building2 size={28} />}</span>
                    <div className="provider-profile-field"><span>Business name</span><strong>{profile.name}</strong></div>
                    <div className="provider-profile-field"><span>Email</span><strong>{profile.email}</strong></div>
                    <div className="provider-profile-field"><span>Phone</span><strong>{profile.phone}</strong></div>
                    <div className="provider-profile-field"><span>Experience</span><strong>{profile.experience} years</strong></div>
                    <div className="provider-profile-field provider-form-full"><span>Description</span><strong>{profile.description}</strong></div>
                    <div className="provider-profile-field"><span>Business address</span><strong>{profile.address}</strong></div>
                    <div className="provider-profile-field"><span>City</span><strong>{profile.city}</strong></div>
                    <div className="provider-profile-field"><span>Locality</span><strong>{profile.locality}</strong></div>
                    <div className="provider-profile-field"><span>PIN code</span><strong>{profile.pin}</strong></div>
                    <div className="provider-profile-field"><span>Service categories</span><strong>{profile.categories}</strong></div>
                    <div className="provider-profile-field"><span>Service areas</span><strong>{profile.areas}</strong></div>
                  </div>
                ) : (
                  <div className="provider-profile-details">
                    <span className="provider-profile-avatar">{profile.name.split(" ").map((part) => part[0]).join("").slice(0, 2)}</span>
                    <div className="provider-profile-field"><span>Provider name</span><strong>{profile.name}</strong></div>
                    <div className="provider-profile-field"><span>Email</span><strong>{profile.email}</strong></div>
                    <div className="provider-profile-field"><span>Phone</span><strong>{profile.phone}</strong></div>
                    <div className="provider-profile-field"><span>Experience</span><strong>{profile.experience} years</strong></div>
                    <div className="provider-profile-field"><span>Service categories</span><strong>{profile.categories}</strong></div>
                    <div className="provider-profile-field"><span>Service areas</span><strong>{profile.areas}</strong></div>
                  </div>
                )
              )}
              <p className="dashboard-sample-note">{business ? "Business profile values are sample data, not saved or sent to a backend." : "Profile values are sample data, not saved or sent to a backend."}</p>
            </section>
          )}

          {activeSection === "team" && business && (
            <section className="dashboard-panel business-team-panel">
              <div className="dashboard-section-heading">
                <div><h2>Team members</h2><p>Manage staff listed with your business. Booking assignment is not available in this prototype.</p></div>
                {!showStaffForm && <button className="primary-btn provider-compact-btn" onClick={() => setShowStaffForm(true)}><Plus size={15} /> Add team member</button>}
              </div>
              {showStaffForm && (
                <form className="provider-form-card business-staff-form" onSubmit={addStaffMember}>
                  <div className="provider-form-heading"><h3>Add a team member</h3><button type="button" className="provider-form-close" onClick={() => setShowStaffForm(false)} aria-label="Close team member form"><X size={17} /></button></div>
                  <div className="provider-form-grid">
                    <label className="provider-form-field"><span>Full name</span><input value={staffDraft.name} onChange={(event) => setStaffDraft({ ...staffDraft, name: event.target.value })} minLength="2" required /></label>
                    <label className="provider-form-field"><span>Role</span><input value={staffDraft.role} onChange={(event) => setStaffDraft({ ...staffDraft, role: event.target.value })} required /></label>
                    <label className="provider-form-field provider-form-full"><span>Email address</span><input type="email" value={staffDraft.email} onChange={(event) => setStaffDraft({ ...staffDraft, email: event.target.value })} required /></label>
                  </div>
                  <div className="dashboard-profile-actions"><button className="primary-btn" type="submit"><Check size={15} /> Add member</button><button className="dashboard-cancel-btn" type="button" onClick={() => setShowStaffForm(false)}>Cancel</button></div>
                </form>
              )}
              <div className="business-team-list">
                {staff.map((member) => (
                  <article className="business-team-card" key={member.id}>
                    <span className="business-team-avatar">{member.name.split(" ").map((part) => part[0]).join("").slice(0, 2)}</span>
                    <div className="business-team-info"><strong>{member.name}</strong><span>{member.role}</span><small>{member.email}</small></div>
                    <button className="provider-delete-btn" onClick={() => removeStaffMember(member)}><Trash2 size={14} /> Remove</button>
                  </article>
                ))}
                {staff.length === 0 && <div className="dashboard-empty-state"><Users size={24} /><strong>No team members yet</strong><span>Add staff members to your sample business profile.</span></div>}
              </div>
              <p className="dashboard-sample-note">Staff details are sample data and remain in frontend state only.</p>
            </section>
          )}
        </div>
      </main>
      {sidebarOpen && <button className="dashboard-sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="Close dashboard navigation"><X size={19} /></button>}
    </div>
  );
}

function App() {
  const [currentPage, setCurrentPage] = useState(() =>
    getPageFromPath(window.location.pathname)
  );
  const [activeCategory, setActiveCategory] = useState("All services");
  const [search, setSearch] = useState("");
  const [location, setLocation] = useState("Hyderabad");
  const [menuOpen, setMenuOpen] = useState(false);
  const [saved, setSaved] = useState([]);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    function handlePopState() {
      setCurrentPage(getPageFromPath(window.location.pathname));
    }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  function navigate(path) {
    window.history.pushState({}, "", path);
    setCurrentPage(getPageFromPath(path));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const visibleProviders = useMemo(() => {
    return providers.filter((provider) => {
      const categoryMatch =
        activeCategory === "All services" ||
        provider.category === activeCategory;

      const searchText = search.trim().toLowerCase();
      const locationText = location.trim().toLowerCase();

      const providerText =
        `${provider.name} ${provider.role} ${provider.category}`.toLowerCase();

      const searchMatch =
        !searchText || providerText.includes(searchText);

      const locationMatch =
        !locationText ||
        locationText === "hyderabad" ||
        locationText.includes("hyderabad") ||
        provider.area.toLowerCase().includes(locationText);

      return categoryMatch && searchMatch && locationMatch;
    });
  }, [activeCategory, search, location]);

  function handleSearch(event) {
    event.preventDefault();
    document.getElementById("providers")?.scrollIntoView({
      behavior: "smooth"
    });
  }

  function toggleSaved(name) {
    setSaved((current) =>
      current.includes(name)
        ? current.filter((item) => item !== name)
        : [...current, name]
    );
  }

  function resetFilters() {
    setActiveCategory("All services");
    setSearch("");
  }

  function showNotice(message) {
    setNotice(message);
  }

  if (currentPage !== "home") {
    if (currentPage === "customer-dashboard") {
      return <CustomerDashboard onNavigate={navigate} />;
    }
    if (currentPage === "provider-profile") {
      return <CustomerDashboard onNavigate={navigate} providerProfileKey={getProviderProfileKey(window.location.pathname)} />;
    }
    if (currentPage === "provider-dashboard") {
      return <ProviderDashboard onNavigate={navigate} />;
    }
    if (currentPage === "business-dashboard") {
      return <ProviderDashboard onNavigate={navigate} business />;
    }
    if (currentPage === "admin-dashboard") {
      return <AdminDashboard onNavigate={navigate} />;
    }
    return <AuthPage page={currentPage} onNavigate={navigate} />;
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" onClick={(event) => {
          event.preventDefault();
          navigate("/");
        }} aria-label="SETHU home">
          <span className="brand-mark">S</span>
          <span>SETHU<span className="brand-dot">.</span></span>
        </a>

        <nav className={menuOpen ? "nav-links open" : "nav-links"}>
          <a href="#services" onClick={() => setMenuOpen(false)}>
            Explore services
          </a>
          <a href="#how-it-works" onClick={() => setMenuOpen(false)}>
            How it works
          </a>
          <a href="#providers" onClick={() => setMenuOpen(false)}>
            Find providers
          </a>
          <div className="mobile-auth-actions">
            <button className="login-btn" onClick={() => {
              setMenuOpen(false);
              navigate("/login");
            }}>Log in</button>
            <button className="primary-btn small" onClick={() => {
              setMenuOpen(false);
              navigate("/register");
            }}>Get started <ArrowRight size={16} /></button>
          </div>
        </nav>

        <div className="header-actions">
          <button
            className="login-btn"
            onClick={() => navigate("/login")}
          >
            Log in
          </button>
          <button
            className="primary-btn small"
            onClick={() => navigate("/register")}
          >
            Get started <ArrowRight size={16} />
          </button>
        </div>

        <button
          className="menu-toggle"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Toggle navigation"
        >
          {menuOpen ? <X /> : <Menu />}
        </button>
      </header>

      <main>
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow">
              <span className="eyebrow-dot" />
              YOUR NEIGHBOURHOOD, ONE CONNECTION AWAY
            </div>

            <h1>
              Find trusted local <span>services with SETHU.</span>
            </h1>

            <p className="hero-description">
              From quick fixes to everyday essentials, connect with trusted
              local professionals without the hassle.
            </p>

            <form className="search-panel" onSubmit={handleSearch}>
              <label className="search-field">
                <Search size={19} />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="What service do you need?"
                  aria-label="Search services or providers"
                />
              </label>

              <span className="search-divider" />

              <label className="location-field">
                <MapPin size={18} />
                <input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="City, locality or PIN code"
                  aria-label="Enter your location"
                />
              </label>

              <button className="primary-btn search-submit" type="submit">
                Search <ArrowRight size={17} />
              </button>
            </form>

            <div className="hero-proof">
              <div className="avatar-stack">
                <img src="https://i.pravatar.cc/80?img=12" alt="Customer" />
                <img src="https://i.pravatar.cc/80?img=33" alt="Customer" />
                <img src="https://i.pravatar.cc/80?img=47" alt="Customer" />
              </div>

              <span>
                <strong>Local professionals</strong>
                <br />
                Ready to help in your area
              </span>

              <span className="proof-divider" />

              <span className="rating-proof">
                <Star size={15} fill="currentColor" />
                4.8 <small>community rating</small>
              </span>
            </div>
          </div>

          <div className="hero-visual">
            <div className="hero-image-wrap">
              <img
                src="https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=1200&q=90"
                alt="Professional technician working at a home"
              />
            </div>

            <div className="floating-card verified-card">
              <span className="float-icon">
                <ShieldCheck size={20} />
              </span>
              <span>
                <strong>Verified professionals</strong>
                <small>Profiles reviewed by SETHU</small>
              </span>
            </div>

            <div className="floating-card help-card">
              <span className="help-number">01</span>
              <span>
                <strong>Find your help</strong>
                <small>Browse services nearby</small>
              </span>
              <ArrowRight size={17} />
            </div>

            <div className="hero-orbit orbit-one" />
            <div className="hero-orbit orbit-two" />
          </div>
        </section>

        <section className="trust-strip">
          <div>
            <ShieldCheck />
            <span>
              <strong>Verified providers</strong>
              <small>Reviewed profiles</small>
            </span>
          </div>
          <div>
            <CalendarDays />
            <span>
              <strong>Flexible scheduling</strong>
              <small>Choose a suitable slot</small>
            </span>
          </div>
          <div>
            <Clock3 />
            <span>
              <strong>Clear request status</strong>
              <small>Track every step</small>
            </span>
          </div>
          <div>
            <Heart />
            <span>
              <strong>Local convenience</strong>
              <small>Services around you</small>
            </span>
          </div>
        </section>

        <section className="section categories-section" id="services">
          <div className="section-heading">
            <div>
              <div className="eyebrow">WHAT CAN WE HELP WITH?</div>
              <h2>Services for your <span>everyday.</span></h2>
            </div>
            <a className="text-link" href="#providers">
              Explore all services <ArrowRight size={16} />
            </a>
          </div>

          <div className="category-grid">
            {categories.map(({ name, icon: Icon, tone }) => (
              <button
                key={name}
                className={`category-card ${activeCategory === name ? "selected" : ""}`}
                onClick={() => {
                  setActiveCategory(name);
                  document.getElementById("providers")?.scrollIntoView({
                    behavior: "smooth"
                  });
                }}
              >
                <span className={`category-icon ${tone}`}>
                  <Icon size={23} />
                </span>
                <strong>{name}</strong>
                <span className="category-arrow">
                  <ArrowRight size={15} />
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="section providers-section" id="providers">
          <div className="section-heading provider-heading">
            <div>
              <div className="eyebrow">GOOD PEOPLE, GREAT WORK</div>
              <h2>Meet local <span>professionals.</span></h2>
              <p>
                Explore providers serving {location.trim() || "your area"}.
              </p>
            </div>

            <button className="filter-btn" onClick={resetFilters}>
              <SlidersHorizontal size={17} /> Reset filters
            </button>
          </div>

          <div className="filter-row">
            {["All services", ...categories.map((item) => item.name)].map((name) => (
              <button
                key={name}
                onClick={() => setActiveCategory(name)}
                className={`filter-chip ${activeCategory === name ? "active" : ""}`}
              >
                {name}
              </button>
            ))}
          </div>

          <div className="provider-count">
            Showing <strong>{visibleProviders.length}</strong> sample providers
          </div>

          <div className="provider-grid">
            {visibleProviders.map((provider) => (
              <article className="provider-card" key={provider.name}>
                <div className="provider-image">
                  <img src={provider.image} alt={provider.role} />

                  <span className="available-pill">
                    <span /> Sample listing
                  </span>

                  <button
                    className={`save-btn ${saved.includes(provider.name) ? "saved" : ""}`}
                    onClick={() => toggleSaved(provider.name)}
                    aria-label="Save provider"
                  >
                    <Heart
                      size={18}
                      fill={saved.includes(provider.name) ? "currentColor" : "none"}
                    />
                  </button>
                </div>

                <div className="provider-info">
                  <div className="provider-title">
                    <div>
                      <h3>{provider.name}</h3>
                      <p>{provider.role}</p>
                    </div>

                    {provider.verified && (
                      <span className="verified-badge">
                        <ShieldCheck size={14} /> Demo verified
                      </span>
                    )}
                  </div>

                  <div className="provider-meta">
                    <span>
                      <Star size={15} fill="currentColor" />
                      {provider.rating}
                      <small>({provider.reviews})</small>
                    </span>
                    <span>
                      <MapPin size={14} /> {provider.area}
                    </span>
                  </div>

                  <div className="provider-bottom">
                    <strong>{provider.price}</strong>
                    <button
                      onClick={() =>
                        showNotice(`${provider.name} profile and booking will be implemented in a later phase.`)
                      }
                    >
                      View profile <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              </article>
            ))}

            {visibleProviders.length === 0 && (
              <div className="empty-state">
                <Search size={28} />
                <strong>No matching sample providers found</strong>
                <span>
                  Try another service or locality. Only four sample providers
                  are currently available.
                </span>
                <button className="text-link" onClick={resetFilters}>
                  Clear filters
                </button>
              </div>
            )}
          </div>
        </section>

        <section className="how-section" id="how-it-works">
          <div className="how-inner">
            <div className="how-copy">
              <div className="eyebrow light">SIMPLE FROM START TO FINISH</div>
              <h2>
                Getting things done<br />
                should feel <span>this easy.</span>
              </h2>
              <p>
                One clear place to discover professionals, send a request
                and stay updated.
              </p>
              <button
                className="light-btn"
                onClick={() =>
                  showNotice("The complete request journey will be implemented after the UI is finalized.")
                }
              >
                See how it works <ArrowRight size={16} />
              </button>
            </div>

            <div className="steps">
              <div className="step">
                <span>01</span>
                <div>
                  <h3>Find a service</h3>
                  <p>Search by service and your locality.</p>
                </div>
              </div>
              <div className="step">
                <span>02</span>
                <div>
                  <h3>Send a request</h3>
                  <p>Choose a provider, date and time slot.</p>
                </div>
              </div>
              <div className="step">
                <span>03</span>
                <div>
                  <h3>Get confirmation</h3>
                  <p>The provider reviews and accepts your request.</p>
                </div>
              </div>
              <div className="step">
                <span>04</span>
                <div>
                  <h3>Track the progress</h3>
                  <p>Follow your request until the work is complete.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="cta-section">
          <div className="cta-icon">
            <Home size={25} />
          </div>
          <div>
            <h2>Good help is closer than you think.</h2>
            <p>Find the right local professional for your next task.</p>
          </div>
          <button
            className="primary-btn"
            onClick={() =>
              document.getElementById("services")?.scrollIntoView({
                behavior: "smooth"
              })
            }
          >
            Explore services <ArrowRight size={17} />
          </button>
        </section>
      </main>

      <footer className="footer">
        <a className="brand footer-brand" href="#">
          <span className="brand-mark">S</span>
          <span>SETHU<span className="brand-dot">.</span></span>
        </a>
        <p>Connecting needs to services.</p>
        <span>© 2026 SETHU. College project prototype.</span>
      </footer>

      {notice && (
        <div className="toast" role="status">
          <span>{notice}</span>
          <button onClick={() => setNotice("")} aria-label="Close message">
            <X size={17} />
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
