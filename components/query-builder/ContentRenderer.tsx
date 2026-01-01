import React, { useMemo, useState } from 'react';
import { Image, Chip, Link, Button, Tooltip, Modal, ModalContent, ModalBody, ModalHeader, useDisclosure } from "@nextui-org/react";
import { 
    FileImage, FileVideo, FileAudio, FileText, FileArchive, FileCode, 
    FileDigit, File, Download, Copy, Eye 
} from 'lucide-react';

interface ContentRendererProps {
    value: any;
    columnName?: string; // 可选：利用列名辅助判断（暂未深度使用，保留接口）
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
    'MQ': 'application/x-msdownload', // exe/dll (simple check)
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
        
        const strVal = String(value);

        // 1. 判断 URL
        // 简单正则判断是否以 http/https 开头或看起来像相对路径
        const isUrl = /^(https?:\/\/.+|\/.+\.\w+)$/i.test(strVal);
        if (isUrl) {
            const ext = strVal.split('.').pop()?.toLowerCase().split('?')[0]; // 获取扩展名，去除query参数
            if (ext && EXTENSIONS[ext]) {
                return { ...EXTENSIONS[ext], src: strVal, mode: 'url' };
            }
            // 如果没有明确扩展名，但看起来像图片URL（包含 image 等关键词），可以尝试作为图片
            if (strVal.match(/\.(img|pic|photo)/i)) return { type: 'image', src: strVal, mode: 'url' };
        }

        // 2. 判断 Base64
        // Base64 正则 (放宽一点条件，长度至少50才尝试渲染为媒体，避免误判短字符串)
        const isBase64Like = strVal.length > 50 && /^[A-Za-z0-9+/]*={0,2}$/.test(strVal.replace(/\s/g, ''));
        
        if (isBase64Like) {
            // 检查魔数
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
            // 如果没有匹配到魔数，但列名包含 Image/Photo/Pic 等，强制尝试 BMP 或通用 Image
            if (columnName && /image|photo|picture|icon|logo/i.test(columnName)) {
                 // 默认尝试 png，或者是 bmp (OData V2 经常返回 raw binary bmp)
                 // 这里做一个通用的 fallback，优先尝试 png
                 return { type: 'image', src: `data:image/png;base64,${strVal}`, mode: 'base64_fallback' };
            }

            // 纯二进制数据，不识别为特定媒体
            return { type: 'binary', length: strVal.length, content: strVal };
        }

        // 3. 普通文本
        return { type: 'text', content: strVal };
    }, [value, columnName]);

    const handlePreview = () => {
        if (detected.type === 'image') {
            setPreviewContent(<Image src={detected.src} alt="Preview" className="max-w-full max-h-[80vh] object-contain" />);
            onOpen();
        } else if (detected.type === 'binary' || detected.type === 'text') {
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
                        // 如果加载失败，回退到图标
                        fallbackSrc="https://via.placeholder.com/40?text=ERR"
                    />
                    <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                        <Eye size={16} className="text-white" />
                    </div>
                </div>
                <div className="flex flex-col">
                    <span className="text-[10px] text-default-500 font-mono truncate max-w-[100px]">
                        {detected.mode === 'base64' ? 'Base64 Image' : 'Image URL'}
                    </span>
                    <span className="text-[9px] text-default-400">{detected.mime?.split('/')[1]?.toUpperCase() || 'IMG'}</span>
                </div>
                
                {/* 预览模态框 */}
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

    if (detected.type === 'file' || detected.type === 'binary') {
        const Icon = detected.icon || File;
        const label = detected.type === 'binary' 
            ? `Binary (${Math.round(detected.length! / 1024)} KB)` 
            : `${detected.mime?.split('/')[1]?.toUpperCase() || 'FILE'}`;

        return (
            <div className="flex items-center gap-2 bg-content2/50 p-1.5 rounded-lg border border-divider max-w-[200px]">
                <div className="w-8 h-8 rounded bg-default-200 flex items-center justify-center shrink-0 text-default-600">
                    <Icon size={18} />
                </div>
                <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-[10px] font-bold text-default-700 truncate" title={label}>{label}</span>
                    <div className="flex gap-1 mt-0.5">
                        {detected.src && (
                            <Link href={detected.src} download isExternal size="sm" className="text-[9px] cursor-pointer text-primary hover:underline">
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
