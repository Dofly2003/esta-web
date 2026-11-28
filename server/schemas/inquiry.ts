// Form Kontak publik (inquiry) dan status inquiry di Inbox.
// Honeypot (`website`) dicek rute lebih dulu. Lalu: wajib (nama, email, pesan) → format email → panjang pesan,
// kemudian field dipotong ke panjang kolom (sama seperti dulu: nama 120, email 200, bisnis 120, layanan/budget 60).
import { check, object, pipe, transform } from "valibot";
import { INQUIRY_STATUS_ALL } from "../../shared/constants";
import { isEmail } from "../../shared/format";
import { oneOfStrict, str } from "./fields";

export const INQUIRY_MAX_MESSAGE = 5000;

export const inquiryForm = pipe(
  object({ name: str(), email: str(), company: str(), service: str(), budget: str(), message: str() }),
  check((v) => !!(v.name && v.email && v.message), "inquiry-required"),
  check((v) => isEmail(v.email), "inquiry-email"),
  check((v) => v.message.length <= INQUIRY_MAX_MESSAGE, "inquiry-too-long"),
  transform((v) => ({
    name: v.name.slice(0, 120),
    email: v.email.slice(0, 200),
    company: v.company.slice(0, 120),
    service: v.service.slice(0, 60),
    budget: v.budget.slice(0, 60),
    message: v.message,
  })),
);

export const inquiryStatusForm = object({ status: oneOfStrict(INQUIRY_STATUS_ALL, "status-invalid") });
