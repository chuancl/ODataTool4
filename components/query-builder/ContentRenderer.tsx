import React, { useMemo, useState } from 'react';
import { Image, Chip, Link, Button, Modal, ModalContent, ModalBody, ModalHeader, useDisclosure } from "@nextui-org/react";
import { 
    FileImage, FileVideo, FileAudio, FileText, FileArchive, FileCode, 
    FileDigit, File, Download, Copy, Eye, Table2, Braces, Calendar, ExternalLink 
} from 'lucide-react';

interface ContentRendererProps {
    value: any;
    columnName?: string;
    onExpand?: () => void;
}

// 常见文件头魔数 (Base64前缀)
const MAGIC_NUMBERS: Record<string, string> = {
    '/9j/': 'image/jpeg',
    'iVBORw0KGgo': 'image/png',
    'R0lGOD': 'image/gif',
    'Qk': 'image/bmp',
    'UklGR': 'image/webp',
    'JVBER': 'application/pdf',
    'UEsDB': 'application/zip',
    'MQ': 'application/x-msdownload', 
};

// 常见扩展名映射
const EXTENSIONS: Record<string, { type: 'image' | 'video' | 'audio' | 'file', mime?: string, icon?: any }> = {
    'jpg': { type: 'image', mime: 'image/jpeg' },
    'jpeg': { type: 'image', mime: 'image/jpeg' },
    'png': { type: 'image', mime: 'image/png' },
    'gif': { type: 'image', mime: 'image/gif' },
    'bmp': { type: 'image', mime: 'image/bmp' },
    'webp': { type: 'image', mime: 'image/webp' },
    'svg': { type: 'image', mime: 'image/svg+xml' },
    'mp4': { type: 'video', mime: 'video/mp4' },
    'webm': { type: 'video', mime: 'video/webm' },
    'ogg': { type: 'video', mime: 'video/ogg' },
    'mp3': { type: 'audio', mime: 'audio/mpeg' },
    'wav': { type: 'audio', mime: 'audio/wav' },
    'pdf': { type: 'file', mime: 'application/pdf', icon: FileText },
    'zip': { type: 'file', mime: 'application/zip', icon: FileArchive },
    'rar': { type: 'file', icon: FileArchive },
    '7z': { type: 'file', icon: FileArchive },
    'txt': { type: 'file', icon: FileText },
    'csv': { type: 'file', icon: FileDigit },
    'json': { type: 'file', icon: FileCode },
    'xml': { type: 'file', icon: FileCode },
};

export const ContentRenderer: React.FC<ContentRendererProps> = ({ value, columnName, onExpand }) => {
    const { isOpen, onOpen, onOpenChange } = useDisclosure();
    const [previewContent, setPreviewContent] = useState<React.ReactNode>(null);

    const detected = useMemo(() => {
        if (value === null || value === undefined) return { type: 'empty' };
        
        // 1. 处理数组 (OData 一对多关系)
        if (Array.isArray(value)) {
            return { type: 'array', count: value.length };
        }

        // 2. 处理对象 (OData 一对一关系 或 V2 Collection)
        if (typeof value === 'object') {
            if (value instanceof Date) return { type: 'date', content: value };

            // --- OData Media Resource Detection (Robust) ---
            let mr: any = null;

            // Strategy 1: Standard __mediaresource property
            if (value.__mediaresource) mr = value.__mediaresource;
            // Strategy 2: Wrapped in d (rare for properties but possible)
            else if (value.d && value.d.__mediaresource) mr = value.d.__mediaresource;
            // Strategy 3: Object IS the media resource (contains standard media keys)
            else if (value.edit_media || value.media_src || value.uri || value.mediaReadLink) mr = value;
            // Strategy 4: Fuzzy Search for mediaresource key (ignore case and underscores)
            else {
                const keys = Object.keys(value);
                const mediaKey = keys.find(k => k.toLowerCase().includes('mediaresource'));
                if (mediaKey) mr = value[mediaKey];
            }

            if (mr) {
                // Extract Source URL
                const src = mr.media_src || mr.edit_media || mr.uri || mr.mediaReadLink || mr.readLink;
                // Extract Mime Type
                const mime = mr.content_type || mr.contentType || mr.ContentType || ''; 

                if (src && typeof src === 'string') {
                    // Check if it's an image
                    const isImageMime = mime.toLowerCase().startsWith('image/');
                    const isVideoMime = mime.toLowerCase().startsWith('video/');
                    const isAudioMime = mime.toLowerCase().startsWith('audio/');
                    
                    const isImageCol = (columnName && /photo|image|picture|icon|avatar|logo/i.test(columnName));
                    const isImageSrc = /photo|image|picture|\.jpg|\.png|\.gif/i.test(src);

                    if (isImageMime || isImageCol || isImageSrc) {
                         return { type: 'image', src, mode: 'stream_link', mime: mime || 'image/*' };
                    }
                    if (isVideoMime) return { type: 'video', src, mode: 'stream_link', mime };
                    if (isAudioMime) return { type: 'audio', src, mode: 'stream_link', mime };

                    // Default to file
                    return { type: 'file', src, mode: 'stream_link', mime: mime || 'application/octet-stream' };
                }
            }

            // V2 格式: { results: [...] }
            if (Array.isArray(value.results)) {
                 return { type: 'array', count: value.results.length };
            }
            // Metadata (纯 Metadata 对象不显示详情)
            if (value.__metadata && Object.keys(value).length === 1) {
                return { type: 'meta' };
            }
            // Deferred
            if (value.__deferred) {
                return { type: 'deferred' };
            }
            
            return { type: 'object', keys: Object.keys(value).length };
        }

        const strVal = String(value).trim();

        // 3. 增强检测：日期时间 (ISO 8601)
        if (
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(strVal) || 
            /^\/Date\(\d+\)\/$/.test(strVal)
        ) {
            return { type: 'date', content: strVal };
        }

        // 4. 判断 Data URI
        if (strVal.startsWith('data:')) {
            if (strVal.startsWith('data:image/')) return { type: 'image', src: strVal, mode: 'data_uri' };
            if (strVal.startsWith('data:video/')) return { type: 'video', src: strVal, mode: 'data_uri' };
            if (strVal.startsWith('data:audio/')) return { type: 'audio', src: strVal, mode: 'data_uri' };
            return { type: 'file', src: strVal, mode: 'data_uri' };
        }

        // 5. 判断 URL
        const isUrl = /^(https?:\/\/.+|\/.+\.\w+|\/.+\/.*)$/i.test(strVal);
        if (isUrl) {
            const src = strVal;

            // A. 基于列名判断 (Edit Media, Src 等)
            if (columnName && /edit_media|media_src/i.test(columnName)) {
                if (/photo|image|picture/i.test(src) || /photo|image|picture/i.test(columnName || '')) {
                    return { type: 'image', src, mode: 'url' };
                }
                return { type: 'file', src, mode: 'url', mime: 'application/octet-stream' };
            }

            // B. 基于扩展名判断
            const ext = src.split('.').pop()?.toLowerCase().split('?')[0];
            if (ext && EXTENSIONS[ext]) {
                return { ...EXTENSIONS[ext], src, mode: 'url' };
            }
            // C. 宽松判断：如果列名是 Photo，且值是 URL，就当作图片
            if (columnName && /photo|image|picture/i.test(columnName)) {
                 return { type: 'image', src, mode: 'url_heuristic' };
            }
            
            if (src.match(/\.(img|pic|photo)/i)) return { type: 'image', src, mode: 'url' };
        }

        // 6. 判断 Base64
        const isBase64Like = strVal.length > 20 && /^[A-Za-z0-9+/]*={0,2}$/.test(strVal.replace(/\s/g, ''));
        if (isBase64Like) {
            for (const [magic, mime] of Object.entries(MAGIC_NUMBERS)) {
                if (strVal.startsWith(magic)) {
                    if (mime.startsWith('image/')) {
                        return { type: 'image', src: `data:${mime};base64,${strVal}`, mode: 'base64', mime };
                    }
                    if (mime === 'application/pdf' || mime === 'application/zip') {
                         return { type: 'file', src: `data:${mime};base64,${strVal}`, mode: 'base64', mime, icon: mime === 'application/pdf' ? FileText : FileArchive };
                    }
                }
            }
            // OLE Wrapped BMP
            if (strVal.length > 104) {
                const oleSlice = strVal.substring(104, 120);
                if (oleSlice.startsWith('Qk')) {
                    return { type: 'image', src: `data:image/bmp;base64,${strVal.substring(104)}`, mode: 'base64_ole', mime: 'image/bmp' };
                }
            }
            // Fallback
            if (columnName && /image|photo|picture|icon|logo/i.test(columnName)) {
                 const fallbackMime = /picture|bmp/i.test(columnName) ? 'image/bmp' : 'image/png';
                 return { type: 'image', src: `data:${fallbackMime};base64,${strVal}`, mode: 'base64_fallback', mime: fallbackMime };
            }
        }

        return { type: 'text', content: strVal };
    }, [value, columnName]);

    const handlePreview = () => {
        if (detected.type === 'image') {
            setPreviewContent(
                <div className="flex flex-col gap-2 items-center">
                    {/* Preview Modal: Use standard img for max compatibility */}
                    <img 
                        src={detected.src} 
                        alt="Preview" 
                        className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-sm bg-default-100/50"
                    />
                     <div className="flex gap-2 mt-2">
                        <Button size="sm" as={Link} href={detected.src} isExternal startContent={<ExternalLink size={14}/>}>
                            Open in New Tab
                        </Button>
                        <div className="text-tiny text-default-400 font-mono flex items-center">
                            {detected.mime || 'unknown mime'} | {detected.mode}
                        </div>
                    </div>
                </div>
            );
            onOpen();
        } else if (detected.type === 'text' || detected.type === 'date') { 
            setPreviewContent(
                <div className="whitespace-pre-wrap break-all font-mono text-xs bg-content2 p-4 rounded max-h-[60vh] overflow-auto">
                    {String(value)}
                </div>
            );
            onOpen();
        } else if (detected.type === 'array' || detected.type === 'object') {
            setPreviewContent(
                <div className="whitespace-pre-wrap break-all font-mono text-xs bg-content2 p-4 rounded max-h-[60vh] overflow-auto">
                    {JSON.stringify(value, null, 2)}
                </div>
            );
            onOpen();
        }
    };

    if (detected.type === 'empty') return <span className="text-default-300 italic text-xs">null</span>;

    // --- Complex Types Rendering ---

    if (detected.type === 'array') {
        return (
            <Chip 
                size="sm" 
                variant="flat" 
                color="secondary" 
                startContent={<Table2 size={12}/>}
                classNames={{ base: "h-5 text-[10px] px-1", content: "font-mono" }}
                onClick={(e) => {
                    if (onExpand) {
                        e.stopPropagation();
                        onExpand();
                    } else {
                        handlePreview();
                    }
                }}
                className="cursor-pointer hover:bg-secondary/20 transition-colors"
            >
                {detected.count} Items
            </Chip>
        );
    }

    if (detected.type === 'object') {
        return (
             <Chip 
                size="sm" 
                variant="flat" 
                color="primary" 
                startContent={<Braces size={12}/>}
                classNames={{ base: "h-5 text-[10px] px-1", content: "font-mono" }}
                onClick={(e) => {
                    if (onExpand) {
                        e.stopPropagation();
                        onExpand();
                    } else {
                        handlePreview();
                    }
                }}
                className="cursor-pointer hover:bg-primary/20 transition-colors"
            >
                Details
            </Chip>
        );
    }

    if (detected.type === 'deferred') {
        return <span className="text-default-300 text-[10px] italic">deferred</span>;
    }
    
    if (detected.type === 'meta') {
        return <span className="text-default-300 text-[10px] italic">metadata</span>;
    }

    // --- Date Formatting ---
    if (detected.type === 'date') {
        const dateStr = String(detected.content);
        let display = dateStr;
        try {
            let dateObj: Date | null = null;
            if (dateStr.startsWith('/Date(')) {
                const ms = parseInt(dateStr.match(/\/Date\((\d+)\)\//)?.[1] || '0');
                dateObj = new Date(ms);
            } else {
                dateObj = new Date(dateStr);
            }
            
            if (!isNaN(dateObj.getTime())) {
                display = dateObj.toLocaleString(); 
            }
        } catch(e) {}

        return (
            <div className="flex items-center gap-1.5 text-xs text-default-600 group cursor-default">
                <Calendar size={12} className="text-default-400 shrink-0"/>
                <span className="truncate group-hover:text-primary transition-colors" title={dateStr}>
                    {display}
                </span>
            </div>
        );
    }

    // --- Media Rendering ---

    if (detected.type === 'image') {
        return (
            <div className="flex items-center gap-2 group">
                <div className="relative w-10 h-10 rounded border border-divider bg-content2 overflow-hidden shrink-0 cursor-pointer" onClick={handlePreview}>
                    {/* 使用原生 img 标签以获得最佳兼容性，尤其是对于无扩展名的流或 BMP 格式 */}
                    <img 
                        src={detected.src} 
                        alt="img" 
                        className="w-full h-full object-cover"
                        onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                            // 可以在这里添加一个 fallback icon 的显示逻辑，但这里简单隐藏
                        }}
                    />
                    <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                        <Eye size={16} className="text-white" />
                    </div>
                </div>
                <div className="flex flex-col justify-center">
                    <span className="text-[10px] text-default-500 font-mono truncate max-w-[100px]" title={columnName}>
                        {detected.mode === 'base64_ole' ? 'OLE Image' : 'Image'}
                    </span>
                    <span className="text-[9px] text-default-400">{detected.mime?.split('/')[1]?.toUpperCase() || 'IMG'}</span>
                </div>
                
                <Modal isOpen={isOpen} onOpenChange={onOpenChange} size="2xl" backdrop="blur">
                    <ModalContent>
                        <ModalHeader>Image Preview</ModalHeader>
                        <ModalBody className="flex justify-center items-center pb-6">
                            {previewContent}
                        </ModalBody>
                    </ModalContent>
                </Modal>
            </div>
        );
    }

    if (detected.type === 'video') {
        return (
            <div className="w-48 h-28 bg-black rounded overflow-hidden relative group border border-divider">
                <video src={detected.src} controls className="w-full h-full object-contain" />
                <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Chip size="sm" color="default" className="text-[9px] h-4">VIDEO</Chip>
                </div>
            </div>
        );
    }

    if (detected.type === 'audio') {
        return (
            <div className="flex items-center gap-2 min-w-[200px] bg-content2 p-1 rounded-full border border-divider">
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                    <FileAudio size={16} className="text-primary" />
                </div>
                <audio src={detected.src} controls className="h-6 w-32" />
            </div>
        );
    }

    if (detected.type === 'file') {
        const Icon = detected.icon || File;
        const label = `${detected.mime?.split('/')[1]?.toUpperCase() || 'FILE'}`;

        return (
            <div className="flex items-center gap-2 bg-content2/50 p-1.5 rounded-lg border border-divider max-w-[200px]">
                <div className="w-8 h-8 rounded bg-default-200 flex items-center justify-center shrink-0 text-default-600">
                    <Icon size={18} />
                </div>
                <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-[10px] font-bold text-default-700 truncate" title={label}>{label}</span>
                    <div className="flex gap-1 mt-0.5">
                        {detected.src && (
                            <Link href={detected.src} download={`download.${detected.mime?.split('/')[1] || 'bin'}`} isExternal size="sm" className="text-[9px] cursor-pointer text-primary hover:underline">
                                <Download size={10} className="mr-0.5"/> Download
                            </Link>
                        )}
                        <span 
                            className="text-[9px] cursor-pointer text-default-500 hover:text-default-700 flex items-center"
                            onClick={() => navigator.clipboard.writeText(String(value))}
                        >
                            <Copy size={10} className="mr-0.5"/> Copy
                        </span>
                    </div>
                </div>
            </div>
        );
    }

    // Default Text
    const str = String(value);
    const showPreviewBtn = str.length > 200;
    
    return (
        <div className="group relative w-full">
            <div className="text-sm text-default-700 font-mono truncate w-full" title={str}>
                {str}
            </div>
            {showPreviewBtn && (
                <Button 
                    isIconOnly 
                    size="sm" 
                    variant="flat" 
                    className="absolute right-0 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 h-6 w-6 min-w-0 bg-content2/80 backdrop-blur shadow-sm"
                    onPress={() => {
                        setPreviewContent(
                             <div className="whitespace-pre-wrap break-all font-mono text-xs bg-content2 p-4 rounded max-h-[60vh] overflow-auto">
                                {str}
                            </div>
                        );
                        onOpen();
                    }}
                >
                    <Eye size={12} />
                </Button>
            )}
             <Modal isOpen={isOpen} onOpenChange={onOpenChange} size="3xl" scrollBehavior="inside">
                <ModalContent>
                    <ModalHeader>Content Preview</ModalHeader>
                    <ModalBody>
                        {previewContent}
                    </ModalBody>
                </ModalContent>
            </Modal>
        </div>
    );
};