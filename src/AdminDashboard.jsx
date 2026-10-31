import React, { useEffect, useState } from "react";
import {
  AlertTriangle, Check, ClipboardList, LayoutDashboard, LogOut,
  Search, ShieldCheck, Tag, Users, X
} from "lucide-react";
import { apiRequest, getApiErrorMessage } from "./api.js";

const sections = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "users", label: "User Management", icon: Users },
  { id: "verifications", label: "Provider Verification", icon: ShieldCheck },
  { id: "categories", label: "Categories", icon: Tag },
  { id: "requests", label: "Requests & Bookings", icon: ClipboardList },
  { id: "complaints", label: "Complaints", icon: AlertTriangle }
];

export default function AdminDashboard({ onNavigate }) {
  const [section, setSection] = useState("overview");
  const [payload, setPayload] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");
  const [category, setCategory] = useState({ name: "", slug: "" });
  const [resolution, setResolution] = useState({});
  const [sidebarOpen, setSidebarOpen] = useState(false);

  async function load() {
    setBusy(true);
    setError("");
    try {
      const path = {
        overview: "/admin/overview",
        users: `/admin/users?role=${encodeURIComponent(filter)}&search=${encodeURIComponent(search)}`,
        verifications: `/admin/verifications?status=${encodeURIComponent(filter || "PENDING")}`,
        categories: "/admin/categories",
        requests: filter.startsWith("booking:")
          ? `/admin/bookings?status=${encodeURIComponent(filter.slice(8))}`
          : `/admin/requests?status=${encodeURIComponent(filter)}`,
        complaints: "/admin/complaints"
      }[section];
      const response = await apiRequest(path);
      setPayload(response.data);
    } catch (loadError) {
      setPayload(null);
      setError(getApiErrorMessage(loadError));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load();
  }, [section, filter]);

  async function act(path, method, body, successMessage) {
    setBusy(true);
    setError("");
    try {
      await apiRequest(path, { method, body });
      setNotice(successMessage);
      await load();
    } catch (actionError) {
      setError(getApiErrorMessage(actionError));
    } finally {
      setBusy(false);
    }
  }

  const heading = sections.find((item) => item.id === section)?.label || "Overview";

  return (
    <div className="customer-dashboard admin-dashboard">
      {sidebarOpen && <button className="dashboard-sidebar-backdrop" onClick={() => setSidebarOpen(false)} aria-label="Close admin navigation" />}
      <aside className={`dashboard-sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
        <a className="brand dashboard-brand" href="/" onClick={(event) => {
          event.preventDefault();
          onNavigate("/");
        }} aria-label="SETHU home">
          <span className="brand-mark">S</span><span>SETHU<span className="brand-dot">.</span></span>
        </a>
        <div className="dashboard-sidebar-label">ADMINISTRATION</div>
        <nav className="dashboard-navigation" aria-label="Admin dashboard">
          {sections.map(({ id, label, icon: Icon }) => (
            <button key={id} className={`dashboard-nav-item ${section === id ? "active" : ""}`} onClick={() => {
              setSection(id);
              setSidebarOpen(false);
              setPayload(null);
              setError("");
              setNotice("");
              setFilter("");
            }}>
              <Icon size={18} /><span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="dashboard-sidebar-bottom">
          <button className="dashboard-nav-item dashboard-logout" onClick={async () => {
            try {
              await apiRequest("/auth/logout", { method: "POST" });
              onNavigate("/login");
            } catch (logoutError) {
              setError(getApiErrorMessage(logoutError));
            }
          }}><LogOut size={18} /><span>Log out</span></button>
          <span className="dashboard-version">SETHU · Admin</span>
        </div>
      </aside>
      <main className="dashboard-main">
        <header className="dashboard-topbar">
          <button className="dashboard-mobile-menu" onClick={() => setSidebarOpen(true)} aria-label="Open admin navigation"><LayoutDashboard size={20} /></button>
          <div className="dashboard-breadcrumb"><span>SETHU</span><span>›</span><strong>{heading}</strong></div><strong className="admin-topbar-label">Admin portal</strong>
        </header>
        <div className="dashboard-content">
          <div className="dashboard-page-heading">
            <div><span className="dashboard-eyebrow">PLATFORM ADMINISTRATION</span><h1>{heading}</h1><p>Manage SETHU accounts and platform activity.</p></div>
            {section === "users" && <form className="admin-search-form" onSubmit={(event) => { event.preventDefault(); load(); }}><label><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search users" /></label><button className="primary-btn provider-compact-btn">Search</button></form>}
          </div>
          {notice && <div className="dashboard-notice" role="status">{notice}<button onClick={() => setNotice("")} aria-label="Dismiss"><X size={15} /></button></div>}
          {error && <div className="admin-error" role="alert"><span>{error}</span>{error.includes("sign in") || error.includes("session") ? <button className="dashboard-outline-btn" onClick={() => onNavigate("/login")}>Sign in</button> : <button className="dashboard-outline-btn" onClick={load}>Retry</button>}</div>}
          {busy && <p className="admin-loading" role="status">Loading platform data…</p>}
          {section === "overview" && payload?.counts && <Overview data={payload} />}
          {section === "users" && <div className="dashboard-panel admin-panel">
            <div className="dashboard-section-heading"><div><h2>Accounts</h2><p>Activate, suspend or deactivate non-admin accounts.</p></div><select aria-label="Filter users by role" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="">All roles</option><option value="CUSTOMER">Customers</option><option value="INDIVIDUAL_PROVIDER">Individual providers</option><option value="BUSINESS_PROVIDER">Businesses</option></select></div>
            <div className="admin-list">{(payload || []).map((user) => <article className="admin-row" key={user.id}><div><strong>{user.business_name || user.name}</strong><p>{user.email} · {user.phone}</p><small>{user.role} · {user.provider_type || "Account"} · {user.verification_status || user.status}</small></div><select aria-label={`Set status for ${user.name}`} value={user.status} onChange={(event) => act(`/admin/users/${user.id}/status`, "PATCH", { status: event.target.value }, "Account status updated.")}><option>ACTIVE</option><option>INACTIVE</option><option>SUSPENDED</option></select></article>)}</div>
          </div>}
          {section === "verifications" && <div className="dashboard-panel admin-panel">
            <div className="dashboard-section-heading"><div><h2>Provider applications</h2><p>Only approved active providers can receive requests.</p></div><select aria-label="Filter provider applications" value={filter || "PENDING"} onChange={(event) => setFilter(event.target.value)}><option value="PENDING">Pending</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option><option value="SUSPENDED">Suspended</option></select></div>
            <div className="admin-list">{(payload || []).map((provider) => <article className="admin-row admin-verification-row" key={provider.user_id}><div><strong>{provider.business_name || provider.name}</strong><p>{provider.email} · {provider.phone}</p><small>{provider.provider_type} · {provider.experience_years} years · {provider.city || "No city provided"}</small><p>{provider.description}</p>{provider.documents?.map((document) => <a className="admin-document-link" key={document.id} href={`/api/admin/documents/${document.id}`} target="_blank" rel="noreferrer">View {document.name}</a>)}{provider.verification_reason && <p>Reason: {provider.verification_reason}</p>}</div>{provider.verification_status === "PENDING" && <div className="admin-row-actions"><button className="primary-btn provider-compact-btn" onClick={() => act(`/admin/verifications/${provider.user_id}`, "PATCH", { status: "APPROVED" }, "Provider approved.")}><Check size={14} /> Approve</button><button className="provider-reject-btn" onClick={() => { const reason = window.prompt("Reason for rejecting this provider application:"); if (reason) act(`/admin/verifications/${provider.user_id}`, "PATCH", { status: "REJECTED", reason }, "Provider rejected."); }}><X size={14} /> Reject</button></div>}</article>)}</div>
          </div>}
          {section === "categories" && <div className="dashboard-panel admin-panel">
            <div className="dashboard-section-heading"><div><h2>Service categories</h2><p>Create categories and control whether they are available.</p></div></div>
            <form className="admin-category-form" onSubmit={(event) => { event.preventDefault(); act("/admin/categories", "POST", category, "Category created."); setCategory({ name: "", slug: "" }); }}><label className="provider-form-field"><span>Category name</span><input value={category.name} onChange={(event) => setCategory({ ...category, name: event.target.value, slug: category.slug || event.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") })} required /></label><label className="provider-form-field"><span>Slug</span><input value={category.slug} onChange={(event) => setCategory({ ...category, slug: event.target.value })} required /></label><button className="primary-btn provider-compact-btn">Add category</button></form>
            <div className="admin-list">{(payload || []).map((item) => <article className="admin-row" key={item.id}><div><strong>{item.name}</strong><small>{item.slug}</small></div><label className="admin-toggle"><input type="checkbox" checked={item.active} onChange={(event) => act(`/admin/categories/${item.id}`, "PATCH", { active: event.target.checked }, "Category updated.")} /> Active</label></article>)}</div>
          </div>}
          {section === "requests" && <div className="dashboard-panel admin-panel">
            <div className="dashboard-section-heading"><div><h2>{filter.startsWith("booking:") ? "Bookings" : "Service requests"}</h2><p>Review request and booking statuses across the platform.</p></div><select aria-label="Filter requests or bookings" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="">All requests</option>{["PENDING","ACCEPTED","REJECTED","EXPIRED","CANCELLED","IN_PROGRESS","COMPLETED"].map((status) => <option key={status} value={status}>{status}</option>)}<option value="booking:">All bookings</option>{["CONFIRMED","IN_PROGRESS","COMPLETED","CANCELLED"].map((status) => <option key={`booking:${status}`} value={`booking:${status}`}>Booking: {status}</option>)}</select></div>
            <div className="admin-list">{(payload || []).map((item) => <article className="admin-row" key={item.id}><div><strong>{item.service_name}</strong><p>{item.customer_name} · {item.business_name || item.provider_name}</p><small>{item.status} · {new Date(item.starts_at).toLocaleString()} · #{item.id}</small></div></article>)}</div>
          </div>}
          {section === "complaints" && <div className="dashboard-panel admin-panel">
            <div className="dashboard-section-heading"><div><h2>Complaints and review reports</h2><p>Record a resolution for each complaint.</p></div></div>
            <div className="admin-list">{(payload?.complaints || []).map((item) => <article className="admin-row admin-complaint-row" key={`complaint-${item.id}`}><div><strong>{item.subject} · {item.status}</strong><p>{item.customer_name} · {item.details}</p><small>{item.provider_name || "No linked provider"} · {new Date(item.created_at).toLocaleString()}</small>{item.resolution && <p>Resolution: {item.resolution}</p>}</div><div className="admin-row-actions"><input aria-label={`Resolution for complaint ${item.id}`} value={resolution[item.id] || item.resolution || ""} onChange={(event) => setResolution({ ...resolution, [item.id]: event.target.value })} placeholder="Resolution" /><select aria-label={`Status for complaint ${item.id}`} defaultValue={item.status === "OPEN" ? "IN_REVIEW" : item.status} onChange={(event) => act(`/admin/complaints/${item.id}`, "PATCH", { status: event.target.value, resolution: resolution[item.id] || item.resolution || "" }, "Complaint updated.")}><option value="IN_REVIEW">In review</option><option value="RESOLVED">Resolved</option><option value="DISMISSED">Dismissed</option></select></div></article>)}{(payload?.reviewReports || []).map((item) => <article className="admin-row" key={`report-${item.id}`}><div><strong>Reported review · {item.status}</strong><p>{item.reporter_name} · {item.reason}</p><small>{item.rating}/5 · {item.review_body}</small></div></article>)}</div>
          </div>}
        </div>
      </main>
      {sidebarOpen && <button className="dashboard-sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="Close admin navigation"><X size={19} /></button>}
    </div>
  );
}

function Overview({ data }) {
  const labels = [
    ["Customers", data.counts.customers],
    ["Individual providers", data.counts.individual_providers],
    ["Business providers", data.counts.business_providers],
    ["Approved providers", data.counts.approved_providers],
    ["Pending verifications", data.counts.pending_verifications],
    ["Service requests", data.counts.service_requests],
    ["Bookings", data.counts.bookings],
    ["Completed bookings", data.counts.completed_bookings],
    ["Cancelled / expired", data.counts.cancelled_or_expired]
  ];
  return <>
    <section className="provider-summary-grid admin-summary-grid" aria-label="Platform summary">{labels.map(([label, count]) => <article className="provider-summary-card" key={label}><span className="provider-summary-icon lavender"><Users size={18} /></span><span className="provider-summary-label">{label}</span><strong>{count}</strong><small>Live database count</small></article>)}</section>
    <section className="dashboard-panel admin-panel"><div className="dashboard-section-heading"><div><h2>Recent platform activity</h2><p>Latest requests, bookings and complaints.</p></div></div><div className="admin-list">{data.activity.map((item) => <article className="admin-row" key={`${item.kind}-${item.id}`}><div><strong>{item.kind} #{item.id}</strong><p>Status: {item.status}</p><small>{new Date(item.created_at).toLocaleString()}</small></div></article>)}</div></section>
  </>;
}
