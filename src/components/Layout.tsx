import { useCallback, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Menu } from 'lucide-react';
import Sidebar from './Sidebar';
import LegalFooter from './LegalFooter';
import UsageBanner from './UsageBanner';

/**
 * Chat-style pages own the full viewport and scroll internally, so their
 * headers and composers stay pinned. They must not sit inside the Layout's
 * scroll container or a page-level scrollbar carries their header away with
 * the messages — and they get no footer, since there is no page bottom.
 */
const FULL_HEIGHT_ROUTES = ['/dashboard/inbox', '/dashboard/chat'];

export default function Layout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { pathname } = useLocation();
  const isFullHeight = FULL_HEIGHT_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );

  const toggleSidebar = useCallback(() => setIsSidebarOpen((isOpen) => !isOpen), []);
  const closeSidebar = useCallback(() => setIsSidebarOpen(false), []);

  return (
    <div className="flex h-screen bg-background text-foreground">
      <Sidebar isOpen={isSidebarOpen} onClose={closeSidebar} />

      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={closeSidebar}
        />
      )}

      <main className="flex-1 overflow-hidden flex flex-col w-full lg:w-auto">
        <div className="lg:hidden sticky top-0 z-30 bg-background border-b border-secondary px-4 py-3 flex items-center justify-between">
          <button
            onClick={toggleSidebar}
            className="p-2 hover:bg-secondary rounded-lg transition-colors"
            aria-label="Toggle menu"
          >
            <Menu className="h-6 w-6" />
          </button>
          <div className="flex items-center gap-2">
            <img
              src="/WolfPack_Media_AI_logo_only_icon.png"
              alt="WolfPack AI"
              className="h-8 w-8 rounded-md bg-white object-contain p-0.5 shadow-sm"
            />
            <span className="font-semibold">WolfPack AI</span>
          </div>
          <div className="w-10" />
        </div>

        <UsageBanner />

        {isFullHeight ? (
          // min-h-0 lets this flex child be shorter than its content, which is
          // what gives the page a definite height for `h-full` to resolve
          // against. Without it the pane grows and the header scrolls off.
          <div className="flex-1 min-h-0">
            <Outlet />
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-auto flex flex-col">
            <div className="flex-1">
              <Outlet />
            </div>
            <LegalFooter variant="compact" className="border-t border-secondary py-4 px-6" />
          </div>
        )}
      </main>
    </div>
  );
}