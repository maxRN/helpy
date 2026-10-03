/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as clips from "../clips.js";
import type * as events from "../events.js";
import type * as invoiceValidators from "../invoiceValidators.js";
import type * as invoices from "../invoices.js";
import type * as ocrValidators from "../ocrValidators.js";
import type * as processes from "../processes.js";
import type * as projects from "../projects.js";
import type * as taskCleanup from "../taskCleanup.js";
import type * as tasks from "../tasks.js";
import type * as workMaps from "../workMaps.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  clips: typeof clips;
  events: typeof events;
  invoiceValidators: typeof invoiceValidators;
  invoices: typeof invoices;
  ocrValidators: typeof ocrValidators;
  processes: typeof processes;
  projects: typeof projects;
  taskCleanup: typeof taskCleanup;
  tasks: typeof tasks;
  workMaps: typeof workMaps;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
