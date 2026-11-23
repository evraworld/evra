"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PiHouse, PiMagnifyingGlass, PiHandshake, PiUserCircle, PiStorefront, PiUsersThree, PiShieldCheck } from "react-icons/pi";

const ICONS = { home: PiHouse, work: PiMagnifyingGlass, deals: PiHandshake, me: PiUserCircle, brand: PiStorefront, creators: PiUsersThree, ops: PiShieldCheck };
export type NavItem = { href: string; label: string; icon: keyof typeof ICONS };

function Items({ items, path }: { items: NavItem[]; path: string }) {
  return items.map(({ href, label, icon }) => {
    const Icon = ICONS[icon];
    const active = path === href || path.startsWith(href + "/");
    return (
      <Link key={href} href={href} className="ev-tab" aria-current={active ? "page" : undefined}>
        <Icon aria-hidden />
        <span>{label}</span>
      </Link>
    );
  });
}

export function Nav({ items, label, extra }: { items: NavItem[]; label: string; extra?: NavItem[] }) {
  const path = usePathname();
  return (
    <>
      <nav className="ev-rail-nav" aria-label={label}>
        <Link href="/home" className="ev-wordmark" style={{ padding: "0 14px 18px" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/company/logo-black.png" alt="EVRA" />
        </Link>
        <Items items={[...items, ...(extra ?? [])]} path={path} />
      </nav>
      <nav className="ev-tabbar" aria-label={label}>
        <Items items={items} path={path} />
      </nav>
    </>
  );
}
