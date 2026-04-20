import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

interface ResultCardProps {
  id: string | number;
  type: 'profile' | 'channel' | 'group';
  displayName: string;
  username?: string;
  numericId?: number;
  tags?: string[];
  firstSeen?: string;
  avatarUrl?: string;
}

export default function ResultCard({
  id,
  type,
  displayName,
  username,
  numericId,
  tags = [],
  firstSeen,
  avatarUrl,
}: ResultCardProps) {
  const href = type === 'profile'
    ? `/lookup/profile/${id}`
    : type === 'channel'
    ? `/lookup/channel/${id}`
    : `/lookup/group/${id}`;

  return (
    <Link
      to={href}
      className="group flex items-center gap-3 h-[46px] bg-[rgba(17,16,24,0.3)] border border-[rgba(58,42,238,0.3)] rounded-[10px] px-3 mb-[14px] hover:border-[rgba(58,42,238,0.55)] transition-colors cursor-pointer"
    >
      {/* Avatar */}
      <div className="shrink-0 w-[32px] h-[32px] rounded-[6px] overflow-hidden bg-[rgba(58,42,238,0.2)] flex items-center justify-center">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={displayName}
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="text-[#3A2AEE] text-[14px] font-semibold">
            {displayName.charAt(0).toUpperCase()}
          </span>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="font-sans font-semibold text-[10px] text-white truncate leading-tight">
          {displayName}
        </p>
        <div className="flex items-center gap-1 flex-wrap">
          {username && (
            <span className="font-sans font-normal text-[6px] text-[#3A2AEE]">
              @{username}
            </span>
          )}
          {numericId !== undefined && (
            <span className="font-sans font-normal text-[6px] text-[rgba(255,255,255,0.3)]">
              {numericId}
            </span>
          )}
          {tags.length > 0 && (
            <span className="font-sans font-normal text-[6px] text-[rgba(255,255,255,0.3)]">
              {tags.join(' | ')}
            </span>
          )}
        </div>
      </div>

      {/* Date + Arrow */}
      <div className="shrink-0 flex items-center gap-2">
        {firstSeen && (
          <div className="text-right">
            <p className="font-sans font-normal text-[5px] text-[rgba(255,255,255,0.3)] uppercase tracking-wider">
              First Seen
            </p>
            <p className="font-sans font-normal text-[8px] text-[rgba(255,255,255,0.7)]">
              {firstSeen}
            </p>
          </div>
        )}
        <ChevronRight className="w-[14px] h-[14px] text-[rgba(255,255,255,0.3)] group-hover:text-[#3A2AEE] transition-colors" />
      </div>
    </Link>
  );
}
