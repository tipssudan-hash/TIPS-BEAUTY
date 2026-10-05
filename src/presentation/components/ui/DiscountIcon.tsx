import React from 'react';

interface DiscountIconProps {
    className?: string;
    size?: number;
}

export const DiscountIcon: React.FC<DiscountIconProps> = ({ className = 'w-5 h-5', size }) => {
    return (
        <svg
            viewBox="0 0 512 512"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={className}
            style={size ? { width: size, height: size } : undefined}
            aria-hidden="true"
        >
            {/* String Loop */}
            <path
                d="M366 160C412 114 466 50 452 36C438 22 374 76 328 122"
                stroke="#E2F0FE"
                strokeWidth="24"
                strokeLinecap="round"
            />

            {/* Back Tag (Yellow/Orange) */}
            <path
                d="M210 470L400 280C422 258 440 200 440 170L440 146C440 126 424 110 404 110L380 110C350 110 292 128 270 150L80 340C56 364 56 404 80 428L122 470C146 494 186 494 210 470Z"
                fill="#FFB03A"
                transform="translate(24, 18)"
            />

            {/* Front Tag (Coral Red) */}
            <path
                d="M176 456L374 258C394 238 416 182 416 154L416 120C416 102 402 88 384 88L350 88C322 88 266 110 246 130L48 328C26 350 26 386 48 408L96 456C118 478 154 478 176 456Z"
                fill="#FF5964"
            />

            {/* Tag Eyelet (Hole) */}
            <circle cx="352" cy="152" r="32" fill="#FFFFFF" />

            {/* Discount Percent Symbol */}
            {/* Divider Bar */}
            <rect
                x="112"
                y="272"
                width="224"
                height="20"
                rx="10"
                fill="#E8F4FF"
            />
            {/* Top Circle */}
            <circle
                cx="224"
                cy="208"
                r="38"
                stroke="#E8F4FF"
                strokeWidth="20"
                fill="none"
            />
            {/* Bottom Circle */}
            <circle
                cx="224"
                cy="356"
                r="38"
                stroke="#E8F4FF"
                strokeWidth="20"
                fill="none"
            />
        </svg>
    );
};
