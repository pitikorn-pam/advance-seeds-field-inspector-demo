import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = dirname(fileURLToPath(import.meta.url));
const tabsLayout = readFileSync(join(root, "(tabs)", "_layout.tsx"), "utf8");
const moreScreen = readFileSync(join(root, "(tabs)", "more.tsx"), "utf8");
const rootLayout = readFileSync(join(root, "_layout.tsx"), "utf8");
const notificationsList = readFileSync(join(root, "notifications", "index.tsx"), "utf8");

test("bottom tabs hide Home and keep Inspect, Varieties, and More", () => {
  assert.match(tabsLayout, /initialRouteName="inspect"/);
  assert.match(tabsLayout, /name="index"[\s\S]*href: null/);
  assert.match(tabsLayout, /name="varieties"[\s\S]*name="inspect"[\s\S]*name="more"/);
  assert.doesNotMatch(tabsLayout, /title: "Home"/);
});

test("More links to notifications as a stack page", () => {
  assert.match(moreScreen, /const \{ data: notifications \} = useNotifications\(\);/);
  assert.match(moreScreen, /const unreadNotifications = \(notifications \?\? \[\]\)\.filter/);
  assert.match(moreScreen, /unreadNotifications > 9 \? "9\+"/);
  assert.match(moreScreen, /label=\{t\("more:menu\.notifications"\)\}/);
  assert.match(moreScreen, /badge=\{notificationBadge\}/);
  assert.match(moreScreen, /router\.push\("\/notifications" as never\)/);
  assert.match(rootLayout, /<Stack\.Screen name="notifications" options=\{\{ headerShown: false \}\} \/>/);
  assert.doesNotMatch(rootLayout, /name="notifications"[\s\S]*presentation: "modal"/);
  assert.match(notificationsList, /renderIcon: \(\) => <ChevronLeft/);
});
