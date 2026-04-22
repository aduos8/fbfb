import "./global.css";

import { Toaster } from "@/components/ui/toaster";
import { createRoot } from "react-dom/client";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { createPortal } from "react-dom";
import { trpc } from "@/lib/trpc";
import { httpBatchLink } from "@trpc/client";
import type { AppRouter } from "../server/trpc/router";
import Index from "./pages/Index";
import Pricing from "./pages/Pricing";
import Placeholder from "./pages/Placeholder";
import NotFound from "./pages/NotFound";
import Login from "./pages/Login";
import SignUp from "./pages/SignUp";
import ForgotPassword from "./pages/ForgotPassword";
import Verify2FA from "./pages/Verify2FA";
import ProfileLookup from "./pages/ProfileLookup";
import ChannelLookup from "./pages/ChannelLookup";
import GroupLookup from "./pages/GroupLookup";
import MessageLookup from "./pages/MessageLookup";
import Dashboard from "./pages/Dashboard";
import AccountSettings from "./pages/AccountSettings";
import Credits from "./pages/Credits";
import Purchases from "./pages/Purchases";
import Vouchers from "./pages/Vouchers";
import Tracking from "./pages/Tracking";
import ProtectedRoute from "@/components/ProtectedRoute";
import AdminRoute from "@/components/AdminRoute";
import AdminLayout from "./pages/admin/AdminLayout";
import AdminOverview from "./pages/admin/AdminOverview";
import AdminUsers from "./pages/admin/AdminUsers";
import AdminCredits from "./pages/admin/AdminCredits";
import AdminVouchers from "./pages/admin/AdminVouchers";
import AdminPurchases from "./pages/admin/AdminPurchases";
import AdminAuditLogs from "./pages/admin/AdminAuditLogs";
import AdminRedactions from "./pages/admin/AdminRedactions";
import Notifications from "./pages/Notifications";
import TrackingCreditsBanner from "./components/TrackingCreditsBanner";

const queryClient = new QueryClient();

export const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: '/api/trpc',
      fetch(url, options) {
        return fetch(url, {
          ...options,
          credentials: "include",
        });
      },
    }),
  ],
});

const NoiseOverlay = () =>
  createPortal(
    <svg
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        zIndex: 99999,
        pointerEvents: "none",
        userSelect: "none",
      }}
    >
      <filter id="noise-filter">
        <feTurbulence
          type="fractalNoise"
          baseFrequency="0.8"
          numOctaves="4"
          stitchTiles="stitch"
        />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <rect width="100%" height="100%" filter="url(#noise-filter)" opacity="0.06" />
    </svg>,
    document.body
  );

const CreditsBanner = () =>
  createPortal(
    <TrackingCreditsBanner />,
    document.body
  );

const App = () => (
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <CreditsBanner />
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/insights" element={<Placeholder />} />
            <Route path="/features" element={<Placeholder />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<SignUp />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/verify-2fa" element={<Verify2FA />} />

            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/account"
              element={
                <ProtectedRoute>
                  <AccountSettings />
                </ProtectedRoute>
              }
            />
            <Route
              path="/credits"
              element={
                <ProtectedRoute>
                  <Credits />
                </ProtectedRoute>
              }
            />
            <Route
              path="/tracking"
              element={
                <ProtectedRoute>
                  <Tracking />
                </ProtectedRoute>
              }
            />
            <Route
              path="/vouchers"
              element={
                <ProtectedRoute>
                  <Vouchers />
                </ProtectedRoute>
              }
            />
            <Route
              path="/purchases"
              element={
                <ProtectedRoute>
                  <Purchases />
                </ProtectedRoute>
              }
            />
            <Route
              path="/notifications"
              element={
                <ProtectedRoute>
                  <Notifications />
                </ProtectedRoute>
              }
            />
            <Route path="/subscriptions" element={<Placeholder />} />

            <Route
              path="/lookup/profile/:id"
              element={
                <ProtectedRoute>
                  <ProfileLookup />
                </ProtectedRoute>
              }
            />
            <Route
              path="/lookup/channel/:id"
              element={
                <ProtectedRoute>
                  <ChannelLookup />
                </ProtectedRoute>
              }
            />
            <Route
              path="/lookup/group/:id"
              element={
                <ProtectedRoute>
                  <GroupLookup />
                </ProtectedRoute>
              }
            />
            <Route
              path="/lookup/message/:chatId/:messageId"
              element={
                <ProtectedRoute>
                  <MessageLookup />
                </ProtectedRoute>
              }
            />

            <Route
              path="/admin"
              element={
                <AdminRoute>
                  <AdminLayout />
                </AdminRoute>
              }
            >
              <Route index element={<AdminOverview />} />
              <Route path="users" element={<AdminUsers />} />
              <Route path="credits" element={<AdminCredits />} />
              <Route path="vouchers" element={<AdminVouchers />} />
              <Route path="purchases" element={<AdminPurchases />} />
              <Route path="audit-logs" element={<AdminAuditLogs />} />
              <Route path="redactions" element={<AdminRedactions />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
        <NoiseOverlay />
      </TooltipProvider>
    </QueryClientProvider>
  </trpc.Provider>
);

createRoot(document.getElementById("root")!).render(<App />);
