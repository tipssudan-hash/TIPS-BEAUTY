import React, { useState } from 'react';
import { imgRenderUrl, imgRenderSrcSet } from '@infrastructure/repositories';

interface ProductImageProps {
    // The original URL as stored; the render endpoint is derived from it and dropped on error.
    src: string;
    alt: string;
    width: number;
    height: number;
    sizes: string;
    quality?: number;
    loading?: 'lazy' | 'eager';
    fetchPriority?: 'high' | 'auto';
    className?: string;
    onLoad?: () => void;
    onError?: () => void;
}

export const ProductImage: React.FC<ProductImageProps> = ({
    src, alt, width, height, sizes, quality, loading = 'lazy', fetchPriority = 'auto', className, onLoad, onError,
}) => {
    // Remembers which URL failed, so a new image starts on its render URL again.
    const [failedSrc, setFailedSrc] = useState<string | null>(null);
    const useOriginal = failedSrc === src;
    const rendered = useOriginal ? src : imgRenderUrl(src, width, quality);

    return (
        <img
            src={rendered}
            srcSet={useOriginal ? undefined : imgRenderSrcSet(src, width, quality) || undefined}
            sizes={sizes}
            width={width}
            height={height}
            loading={loading}
            fetchPriority={fetchPriority}
            decoding="async"
            alt={alt}
            className={className}
            onLoad={onLoad}
            onError={() => {
                if (!useOriginal && rendered !== src) {
                    setFailedSrc(src);
                    return;
                }
                onError?.();
            }}
        />
    );
};
