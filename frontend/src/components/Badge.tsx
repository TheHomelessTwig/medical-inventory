import React from 'react';

type Color = 'blue' | 'green' | 'red' | 'yellow' | 'orange' | 'purple' | 'slate' | 'cyan' | 'emerald';

interface BadgeProps {
  children: React.ReactNode;
  color?: Color;
  className?: string;
}

const colorMap: Record<Color, string> = {
  blue: 'bg-blue-100 text-blue-800',
  green: 'bg-green-100 text-green-800',
  emerald: 'bg-emerald-100 text-emerald-800',
  red: 'bg-red-100 text-red-800',
  yellow: 'bg-yellow-100 text-yellow-800',
  orange: 'bg-orange-100 text-orange-800',
  purple: 'bg-purple-100 text-purple-800',
  slate: 'bg-slate-100 text-slate-700',
  cyan: 'bg-cyan-100 text-cyan-800',
};

export const statusColors: Record<string, Color> = {
  pending: 'yellow',
  accepted: 'blue',
  in_progress: 'cyan',
  fulfilled: 'emerald',
  partially_fulfilled: 'orange',
  cancelled: 'slate',
  received: 'blue',
  verified: 'purple',
  posted: 'emerald',
  in_progress_stocktake: 'blue',
  completed: 'emerald',
};

export const priorityColors: Record<string, Color> = {
  low: 'slate',
  normal: 'blue',
  high: 'orange',
  urgent: 'red',
};

const Badge: React.FC<BadgeProps> = ({ children, color = 'slate', className = '' }) => (
  <span className={`badge ${colorMap[color]} ${className}`}>
    {children}
  </span>
);

export default Badge;
