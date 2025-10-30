import React, { useState } from 'react';
import { Link, useLocation } from 'react-router';
import { ChevronDown } from 'lucide-react';
import { useBadges } from '../../provider/badge-context';

// Navigation item type
interface NavItem {
  name: string;
  href: string;
  icon: string; // SVG path
  badgeKey?: 'notifications' | 'messages'; // Key to identify which badge to show
  hasDropdown?: boolean; // For Administration item
}

// Define the navigation items matching Figma design
const navItems: NavItem[] = [
  {
    name: 'Dashboard',
    href: '/dashboard',
    icon: '/assets/4001ba5860d2858f2469e275a4ce7fe2c2c2a952.svg', // Dashboard icon
  },
  {
    name: 'Workspace',
    href: '/workspace',
    icon: '/assets/84789fe1294f4eedc3013b31bb79e7394bd87fab.svg', // Building icon
  },
  {
    name: 'Meetings',
    href: '/meetings',
    icon: '/assets/f9c7d9cff49e119c3ec5f445cfc83669d39c4316.svg', // Meeting icon
  },
  {
    name: 'Messages',
    href: '/messages',
    icon: '/assets/8fa45b78e2676154445cac574d31fb27521e2ea2.svg', // Message icon
    badgeKey: 'messages',
  },
  {
    name: 'Notifications',
    href: '/notifications',
    icon: '/assets/2d994bf0fad32811c48b4a9c7fec2f06e9e67362.svg', // Bell icon
    badgeKey: 'notifications',
  },
  {
    name: 'Administration',
    href: '/administration',
    icon: '/assets/b7b1ff15d3dbedec030add1434e807ef753068e4.svg', // Security icon
    hasDropdown: true,
  },
];

const VerticalSidebar = () => {
  const location = useLocation();
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const { badgeCounts } = useBadges();

  const isActive = (href: string) => {
    return location.pathname === href || location.pathname.startsWith(href + '/');
  };

  const toggleDropdown = (itemName: string) => {
    setExpandedItems((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(itemName)) {
        newSet.delete(itemName);
      } else {
        newSet.add(itemName);
      }
      return newSet;
    });
  };

  return (
    <div
      className="flex flex-col bg-white h-screen border-r border-gray-200"
      style={{ width: '224px' }} // Sidebar width from Figma
    >
      {/* Logo Section */}
      <div className="flex items-center px-[16px] py-[20px] border-b border-gray-200">
        <div className="flex items-center gap-[12px]">
          <img
            src="/pcs_logo.jpg"
            alt="MVDA Logo"
            className="w-[40px] h-[40px] rounded-[8px] object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
          <div className="flex flex-col">
            <span className="font-['Inter:SemiBold',sans-serif] text-[14px] leading-[normal] text-black">
              Mathura Vrindavan
            </span>
            <span className="font-['Inter:Regular',sans-serif] text-[12px] leading-[normal] text-[#717182]">
              Development Authority
            </span>
          </div>
        </div>
      </div>

      {/* MENU Label */}
      <div className="px-[16px] pt-[20px] pb-[12px]">
        <span className="font-['Inter:Regular',sans-serif] text-[12px] tracking-[0.5px] text-[#717182] uppercase">
          Menu
        </span>
      </div>

      {/* Navigation Items */}
      <nav className="flex-1 px-[12px] space-y-[4px]">
        {navItems.map((item) => {
          const active = isActive(item.href);
          const isExpanded = expandedItems.has(item.name);

          return (
            <div key={item.name}>
              {item.hasDropdown ? (
                // Administration with dropdown
                <button
                  onClick={() => toggleDropdown(item.name)}
                  className={`
                    w-[200px] flex items-center justify-between
                    rounded-[5px] pl-[12px] pr-0 py-[10px]
                    transition-colors
                    ${
                      active
                        ? 'bg-[#f2761b] text-white'
                        : isExpanded
                        ? 'bg-[#e6e8ec] text-[#717182]'
                        : 'text-[#717182] hover:bg-[#e6e8ec]'
                    }
                  `}
                >
                  <div className="flex items-center gap-[12px]">
                    <img
                      src={item.icon}
                      alt={item.name}
                      className="w-[20px] h-[20px]"
                    />
                    <span className="font-['Inter:Medium',sans-serif] text-[14px] tracking-[0.5px] leading-[normal]">
                      {item.name}
                    </span>
                  </div>
                  <ChevronDown
                    className={`w-[24px] h-[24px] transition-transform ${
                      isExpanded ? 'rotate-180' : ''
                    }`}
                  />
                </button>
              ) : (
                // Regular navigation item
                <Link
                  to={item.href}
                  className={`
                    w-[200px] flex items-center gap-[12px]
                    rounded-[5px] pl-[12px] pr-0 py-[12px]
                    transition-colors
                    ${
                      active
                        ? 'bg-[#f2761b] text-white'
                        : 'text-[#717182] hover:bg-[#e6e8ec]'
                    }
                  `}
                >
                  <img
                    src={item.icon}
                    alt={item.name}
                    className="w-[20px] h-[20px] shrink-0"
                  />
                  <span className="font-['Inter:Medium',sans-serif] text-[14px] tracking-[0.5px] leading-[normal] grow">
                    {item.name}
                  </span>
                  {item.badgeKey && badgeCounts[item.badgeKey] > 0 && (
                    <div className="relative w-[20px] h-[20px] shrink-0">
                      {/* Notification badge */}
                      <div
                        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
                        style={{ transform: 'translate(-50%, -50%) rotate(90deg)' }}
                      >
                        <div className="bg-[#f2761b] rounded-[10px] p-[3px] flex items-center justify-center">
                          <span
                            className="font-['Inter:Regular',sans-serif] text-[10px] text-white leading-[7px]"
                            style={{ transform: 'rotate(-90deg)' }}
                          >
                            {badgeCounts[item.badgeKey]}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </Link>
              )}
            </div>
          );
        })}
      </nav>
    </div>
  );
};

export default VerticalSidebar;
