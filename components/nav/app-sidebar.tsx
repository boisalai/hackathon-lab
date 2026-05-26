"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, Home, Scale, Eye, ShieldCheck } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const navItems = [
  {
    label: "Accueil",
    href: "/",
    icon: Home,
    available: true,
  },
  {
    label: "Résumeur de jugement",
    href: "/judgment",
    icon: Scale,
    available: true,
  },
  {
    label: "Anonymiseur",
    href: "/anonymize",
    icon: Eye,
    available: true,
  },
  {
    label: "Audit de clauses",
    href: "/audit",
    icon: ShieldCheck,
    available: false, // 5C
  },
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <FileText className="h-5 w-5 text-neutral-700" />
          <span className="font-semibold text-sm">hackathon-lab</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Outils</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const isActive = pathname === item.href;
                const Icon = item.icon;
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      disabled={!item.available}
                    >
                      {item.available ? (
                        <Link href={item.href}>
                          <Icon />
                          <span>{item.label}</span>
                        </Link>
                      ) : (
                        <div className="cursor-not-allowed opacity-50">
                          <Icon />
                          <span>{item.label}</span>
                          <span className="ml-auto text-[10px] text-neutral-400">
                            bientôt
                          </span>
                        </div>
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}