import React from 'react';

interface LoadingSpinnerProps {
  message?: string;
  size?: 'sm' | 'md' | 'lg';
}

const sizes = { sm: 'w-5 h-5', md: 'w-8 h-8', lg: 'w-12 h-12' };

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ message = 'Loading...', size = 'md' }) => (
  <div className="flex flex-col items-center justify-center py-16 gap-3">
    <div className={`${sizes[size]} border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin`} />
    {message && <p className="text-slate-500 text-sm">{message}</p>}
  </div>
);

export default LoadingSpinner;

export const PageLoader: React.FC = () => (
  <div className="min-h-screen flex items-center justify-center">
    <LoadingSpinner size="lg" />
  </div>
);
