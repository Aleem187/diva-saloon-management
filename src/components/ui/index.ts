/**
 * The ORIGINAL component set, re-exported so every existing
 * `import { ... } from "@/components/ui"` keeps resolving to exactly what it
 * did before the redesign.
 *
 * The redesign kit lives alongside in this folder and is imported by path
 * (`@/components/ui/button`, `@/components/ui/pill`, ...). Several names exist
 * in both (Button, Card, EmptyState, Field, Input, Select); pages are moved
 * from the legacy versions to the new ones phase by phase, and this file is
 * retired when the last page has moved.
 */
export * from "./legacy";
