import React, { useMemo, useState } from 'react';
import { Image, Chip, Link, Button, Modal, ModalContent, ModalBody, ModalHeader, useDisclosure } from "@nextui-org/react";
import { 
    FileImage, FileVideo, FileAudio, FileText, FileArchive, FileCode, 
    FileDigit, File, Download, Copy, Eye 
} from 'lucide-react';

interface ContentRendererProps {
    value: any;
    columnName?: string;
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

export const ContentRenderer: React.FC<ContentRendererProps> = ({ value, columnName }) => {
    const { isOpen, onOpen, onOpenChange } = useDisclosure();
    const [previewContent, setPreviewContent] = useState<React.ReactNode>(null);

    const detected = useMemo(() => {
        if (value === null || value === undefined) return { type: 'empty' };
        
        const strVal = String(value).trim();

        // 0. 判断 Data URI (e.g. data:image/png;base64,...)
        if (strVal.startsWith('data:')) {
            if (strVal.startsWith('data:image/')) return { type: 'image', src: strVal, mode: 'data_uri' };
            if (strVal.startsWith('data:video/')) return { type: 'video', src: strVal, mode: 'data_uri' };
            if (strVal.startsWith('data:audio/')) return { type: 'audio', src: strVal, mode: 'data_uri' };
            return { type: 'file', src: strVal, mode: 'data_uri' };
        }

        // 1. 判断 URL
        const isUrl = /^(https?:\/\/.+|\/.+\.\w+)$/i.test(strVal);
        if (isUrl) {
            const ext = strVal.split('.').pop()?.toLowerCase().split('?')[0];
            if (ext && EXTENSIONS[ext]) {
                return { ...EXTENSIONS[ext], src: strVal, mode: 'url' };
            }
            if (strVal.match(/\.(img|pic|photo)/i)) return { type: 'image', src: strVal, mode: 'url' };
        }

        // 2. 判断 Base64
        // 放宽正则条件
        const isBase64Like = strVal.length > 20 && /^[A-Za-z0-9+/]*={0,2}$/.test(strVal.replace(/\s/g, ''));
        
        if (isBase64Like) {
            // A. 检查标准文件头 (Magic Numbers)
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

            // B. 特殊处理：OLE Wrapped BMP (常见于 Northwind 等旧 OData 服务)
            // Access 数据库通常会在图片数据前添加 78 字节的 OLE Header
            // 78 bytes * 8 bits / 6 bits per char = 104 characters
            if (strVal.length > 104) {
                // 检查第 104 个字符开始是否是 BMP 魔数 (Base64 'Qk' = 'BM')
                const oleSlice = strVal.substring(104, 120);
                if (oleSlice.startsWith('Qk')) {
                    return { 
                        type: 'image', 
                        src: `data:image/bmp;base64,${strVal.substring(104)}`, 
                        mode: 'base64_ole', 
                        mime: 'image/bmp' 
                    };
                }
            }

            // C. 启发式回退 (基于列名)
            // 如果没有匹配到魔数，但列名暗示是图片，尝试强制渲染
            if (columnName && /image|photo|picture|icon|logo/i.test(columnName)) {
                 // 如果列名包含 'picture' (Northwind习惯), 优先尝试 BMP
                 // 否则默认尝试 PNG
                 const fallbackMime = /picture|bmp/i.test(columnName) ? 'image/bmp' : 'image/png';
                 return { type: 'image', src: `data:${fallbackMime};base64,${strVal}`, mode: 'base64_fallback', mime: fallbackMime };
            }

            // D. 纯二进制数据 (Removed: Description 等长文本容易被误判为二进制)
            // 只有当明确识别出文件头或列名特征时才渲染为多媒体，否则默认回退到文本
            // return { type: 'binary', length: strVal.length, content: strVal };
        }

        // 3. 普通文本
        return { type: 'text', content: strVal };
    }, [value, columnName]);

    const handlePreview = () => {
        if (detected.type === 'image') {
            setPreviewContent(
                <div className="flex flex-col gap-2 items-center">
                    <Image 
                        src={detected.src} 
                        alt="Preview" 
                        className="max-w-full max-h-[80vh] object-contain"
                        // 移除 NextUI 的默认加载样式，避免干扰
                        disableSkeleton
                    />
                    <div className="text-tiny text-default-400 font-mono">
                        {detected.mime || 'unknown mime'} | {detected.mode}
                    </div>
                </div>
            );
            onOpen();
        } else if (detected.type === 'text') { // Explicitly check text as binary was removed
            setPreviewContent(
                <div className="whitespace-pre-wrap break-all font-mono text-xs bg-content2 p-4 rounded max-h-[60vh] overflow-auto">
                    {String(value)}
                </div>
            );
            onOpen();
        }
    };

    if (detected.type === 'empty') return <span className="text-default-300 italic">null</span>;

    if (detected.type === 'image') {
        return (
            <div className="flex items-center gap-2 group">
                <div className="relative w-10 h-10 rounded border border-divider bg-content2 overflow-hidden shrink-0 cursor-pointer" onClick={handlePreview}>
                    <Image 
                        src={detected.src} 
                        alt="img" 
                        classNames={{ wrapper: "w-full h-full", img: "w-full h-full object-cover" }}
                        fallbackSrc="https://via.placeholder.com/40?text=ERR"
                        disableSkeleton
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
        // Removed binary label check logic as binary type is deprecated
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

    // Default Text with truncation
    const str = String(value);
    const isLong = str.length > 50;
    
    return (
        <div className="group relative">
            <span className="text-sm text-default-700 font-mono whitespace-nowrap" title={str}>
                {isLong ? str.substring(0, 50) + '...' : str}
            </span>
            {isLong && (
                <Button 
                    isIconOnly 
                    size="sm" 
                    variant="light" 
                    className="absolute right-0 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 h-6 w-6 min-w-0"
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