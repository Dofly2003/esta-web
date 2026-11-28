/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    user?: import("../shared/types").User;
    /** /api/nav yang sudah dimulai middleware (dibaca Dash.astro) */
    nav?: Promise<import("../shared/types").NavSummary>;
  }
}
