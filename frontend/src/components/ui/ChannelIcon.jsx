import React from 'react';
import { Send, MessageCircle, MessageSquare, Instagram, Globe, Code } from 'lucide-react';

export default function ChannelIcon({ channelType, className = '', size = 18 }) {
  switch (channelType?.toLowerCase()) {
    case 'telegram':
      return (
        <Send 
          size={size} 
          className={`text-[#2AABEE] ${className}`} 
          style={{ transform: 'rotate(-30deg)' }} 
        />
      );
    case 'whatsapp':
      return (
        <MessageCircle 
          size={size} 
          className={`text-[#25D366] fill-[#25D366]/10 ${className}`} 
        />
      );
    case 'facebook':
      return (
        <MessageSquare 
          size={size} 
          className={`text-[#0084FF] fill-[#0084FF]/10 ${className}`} 
        />
      );
    case 'instagram':
      return (
        <Instagram 
          size={size} 
          className={`text-[#E1306C] ${className}`} 
        />
      );
    case 'website':
      return (
        <Globe 
          size={size} 
          className={`text-[#00C9B1] ${className}`} 
        />
      );
    case 'line':
      return (
        <MessageSquare 
          size={size} 
          className={`text-[#00B900] ${className}`} 
        />
      );
    case 'api':
      return (
        <Code 
          size={size} 
          className={`text-[#94A3B8] ${className}`} 
        />
      );
    default:
      return <MessageSquare size={size} className={className} />;
  }
}
