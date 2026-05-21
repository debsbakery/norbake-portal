import { ReactNode } from "react";

export default function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="bg-stone-50 min-h-screen">      {children}
    </div>
  );
}