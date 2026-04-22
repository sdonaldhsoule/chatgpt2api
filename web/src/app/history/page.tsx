"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Download, Images, LoaderCircle, Sparkles, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { ImageLightbox } from "@/components/image-lightbox";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  deleteImageHistoryImages,
  fetchImageHistory,
  fetchImageHistoryImage,
  type ApiHistoryImage,
  type ApiImageHistoryRecord,
} from "@/lib/api";

const PAGE_SIZE = 24;

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "未知时间";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatTokenCount(value: number) {
  return new Intl.NumberFormat("zh-CN").format(Math.max(0, value || 0));
}

function buildCacheKey(recordId: string, imageId: string) {
  return `${recordId}:${imageId}`;
}

function splitCacheKey(value: string) {
  const separatorIndex = value.indexOf(":");
  if (separatorIndex <= 0) {
    return null;
  }
  const recordId = value.slice(0, separatorIndex);
  const imageId = value.slice(separatorIndex + 1);
  if (!recordId || !imageId) {
    return null;
  }
  return { recordId, imageId };
}

export default function HistoryPage() {
  const objectUrlRef = useRef<Record<string, string>>({});
  const [records, setRecords] = useState<ApiImageHistoryRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [thumbnailUrls, setThumbnailUrls] = useState<Record<string, string>>({});
  const [lightboxImages, setLightboxImages] = useState<Array<{ id: string; src: string }>>([]);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [loadingRecordId, setLoadingRecordId] = useState<string | null>(null);
  const [promptRecord, setPromptRecord] = useState<ApiImageHistoryRecord | null>(null);
  const [page, setPage] = useState(1);
  const [isManageMode, setIsManageMode] = useState(false);
  const [selectedImageKeys, setSelectedImageKeys] = useState<string[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const totalPages = Math.max(1, Math.ceil(records.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRecords = records.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const totalImages = records.reduce((sum, record) => sum + Math.max(0, record.image_count), 0);
  const totalOutputTokens = records.reduce((sum, record) => sum + Math.max(0, record.usage?.output_tokens || 0), 0);

  const currentPageImageKeySet = new Set<string>();
  for (const record of pageRecords) {
    for (const image of record.images || []) {
      currentPageImageKeySet.add(buildCacheKey(record.id, image.id));
    }
  }
  const selectedImageKeySet = new Set(selectedImageKeys);
  const selectedCount = selectedImageKeys.length;

  useEffect(() => {
    let cancelled = false;

    const loadHistory = async () => {
      try {
        const data = await fetchImageHistory();
        if (cancelled) {
          return;
        }
        setRecords(data.items || []);
      } catch (error) {
        const message = error instanceof Error ? error.message : "读取 API 历史失败";
        toast.error(message);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadHistory();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  useEffect(() => {
    let cancelled = false;

    const loadThumbnails = async () => {
      const nextPageRecords = records.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
      for (const record of nextPageRecords) {
        const images = isManageMode ? record.images || [] : record.images?.slice(0, 1) || [];
        for (const image of images) {
          const cacheKey = buildCacheKey(record.id, image.id);
          if (objectUrlRef.current[cacheKey]) {
            continue;
          }
          try {
            const blob = await fetchImageHistoryImage(record.id, image.id);
            if (cancelled) {
              return;
            }
            const objectUrl = URL.createObjectURL(blob);
            objectUrlRef.current[cacheKey] = objectUrl;
            setThumbnailUrls((current) => ({ ...current, [cacheKey]: objectUrl }));
          } catch (error) {
            const message = error instanceof Error ? error.message : "加载缩略图失败";
            toast.error(message);
            return;
          }
        }
      }
    };

    void loadThumbnails();
    return () => {
      cancelled = true;
    };
  }, [isManageMode, records, safePage]);

  useEffect(() => {
    if (!isManageMode) {
      return;
    }
    // 仅当前页可选：翻页时清空选择。
    setSelectedImageKeys([]);
    setDeleteConfirmOpen(false);
  }, [isManageMode, safePage]);

  useEffect(() => {
    if (!isManageMode) {
      return;
    }
    if (pageRecords.length === 0) {
      setIsManageMode(false);
      setSelectedImageKeys([]);
      setDeleteConfirmOpen(false);
    }
  }, [isManageMode, pageRecords.length]);

  useEffect(() => {
    return () => {
      Object.values(objectUrlRef.current).forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const openRecordLightbox = async (record: ApiImageHistoryRecord, startIndex = 0) => {
    if (!record.images?.length) {
      return;
    }

    setLoadingRecordId(record.id);
    try {
      const nextImages: Array<{ id: string; src: string }> = [];
      for (const image of record.images) {
        const cacheKey = buildCacheKey(record.id, image.id);
        let src = objectUrlRef.current[cacheKey];
        if (!src) {
          const blob = await fetchImageHistoryImage(record.id, image.id);
          src = URL.createObjectURL(blob);
          objectUrlRef.current[cacheKey] = src;
          setThumbnailUrls((current) => ({ ...current, [cacheKey]: src }));
        }
        nextImages.push({ id: image.id, src });
      }
      setLightboxImages(nextImages);
      setLightboxIndex(startIndex);
      setLightboxOpen(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "加载大图失败";
      toast.error(message);
    } finally {
      setLoadingRecordId(null);
    }
  };

  const handleDownload = async (recordId: string, image: ApiHistoryImage) => {
    try {
      const blob = await fetchImageHistoryImage(recordId, image.id);
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = image.file_name || `${image.id}.png`;
      link.click();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message : "下载图片失败";
      toast.error(message);
    }
  };

  const toggleImageSelection = (recordId: string, imageId: string) => {
    const cacheKey = buildCacheKey(recordId, imageId);
    if (!currentPageImageKeySet.has(cacheKey)) {
      return;
    }
    setSelectedImageKeys((current) => {
      if (current.includes(cacheKey)) {
        return current.filter((item) => item !== cacheKey);
      }
      return [...current, cacheKey];
    });
  };

  const selectAllCurrentPage = () => {
    setSelectedImageKeys(Array.from(currentPageImageKeySet));
  };

  const clearSelection = () => {
    setSelectedImageKeys([]);
  };

  const reconcileObjectUrlCache = (nextRecords: ApiImageHistoryRecord[]) => {
    const validKeys = new Set<string>();
    for (const record of nextRecords) {
      for (const image of record.images || []) {
        validKeys.add(buildCacheKey(record.id, image.id));
      }
    }

    for (const [cacheKey, objectUrl] of Object.entries(objectUrlRef.current)) {
      if (validKeys.has(cacheKey)) {
        continue;
      }
      URL.revokeObjectURL(objectUrl);
      delete objectUrlRef.current[cacheKey];
    }

    setThumbnailUrls((current) => {
      const next: Record<string, string> = {};
      for (const [cacheKey, objectUrl] of Object.entries(current)) {
        if (validKeys.has(cacheKey)) {
          next[cacheKey] = objectUrl;
        }
      }
      return next;
    });
  };

  const confirmDeleteSelected = () => {
    const currentPageSelectedCount = selectedImageKeys.filter((key) => currentPageImageKeySet.has(key)).length;
    if (currentPageSelectedCount <= 0) {
      toast.error("请先选择当前页要删除的图片");
      return;
    }
    setDeleteConfirmOpen(true);
  };

  const runDeleteSelected = async () => {
    const itemsByRecord = new Map<string, string[]>();
    for (const key of selectedImageKeys) {
      if (!currentPageImageKeySet.has(key)) {
        continue;
      }
      const parts = splitCacheKey(key);
      if (!parts) {
        continue;
      }
      const currentList = itemsByRecord.get(parts.recordId) || [];
      currentList.push(parts.imageId);
      itemsByRecord.set(parts.recordId, currentList);
    }

    const deleteItems = Array.from(itemsByRecord.entries()).map(([record_id, image_ids]) => ({
      record_id,
      image_ids,
    }));

    if (deleteItems.length <= 0) {
      toast.error("当前页没有可删除的选择");
      setDeleteConfirmOpen(false);
      return;
    }

    setIsDeleting(true);
    try {
      const payload = await deleteImageHistoryImages(deleteItems);
      const nextRecords = payload.items || [];
      setRecords(nextRecords);
      reconcileObjectUrlCache(nextRecords);
      setLightboxOpen(false);
      setLightboxImages([]);
      setSelectedImageKeys([]);
      setDeleteConfirmOpen(false);
      toast.success(`已删除 ${payload.deleted_images || 0} 张图片`);
      if (nextRecords.length === 0) {
        setIsManageMode(false);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "删除图片失败";
      toast.error(message);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <section className="mx-auto flex w-full max-w-[1380px] flex-col gap-4 pb-6">
        <Card className="overflow-hidden border-stone-200/80 bg-white/80">
          <CardHeader className="pb-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <CardTitle className="text-xl text-stone-950">API 图片历史</CardTitle>
                <CardDescription className="mt-2 text-stone-500">
                  查看通过 API 生成并落盘保存的图片记录。当前仅展示服务端统一历史，不包含浏览器本地画图记录。
                </CardDescription>
              </div>
              <div className="flex flex-col items-end gap-3">
                <div className="flex flex-wrap justify-end gap-3 text-sm text-stone-600">
                  <span className="rounded-full bg-stone-100 px-4 py-2">记录 {formatTokenCount(records.length)}</span>
                  <span className="rounded-full bg-stone-100 px-4 py-2">图片 {formatTokenCount(totalImages)}</span>
                  <span className="rounded-full bg-stone-100 px-4 py-2">
                    输出 Token {formatTokenCount(totalOutputTokens)}
                  </span>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  {isManageMode ? (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-2xl border-stone-200 bg-white"
                        onClick={selectAllCurrentPage}
                        disabled={pageRecords.length === 0}
                      >
                        全选当前页
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-2xl border-stone-200 bg-white"
                        onClick={clearSelection}
                        disabled={selectedCount === 0}
                      >
                        清空选择
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        className="rounded-2xl"
                        onClick={confirmDeleteSelected}
                        disabled={selectedCount === 0 || isDeleting}
                      >
                        {isDeleting ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                        删除所选
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        className="rounded-2xl"
                        onClick={() => {
                          setIsManageMode(false);
                          setSelectedImageKeys([]);
                          setDeleteConfirmOpen(false);
                        }}
                        disabled={isDeleting}
                      >
                        <X className="size-4" />
                        取消管理
                      </Button>
                    </>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-2xl border-stone-200 bg-white"
                      onClick={() => {
                        setIsManageMode(true);
                        setSelectedImageKeys([]);
                        setLightboxOpen(false);
                      }}
                      disabled={isLoading || records.length === 0}
                    >
                      批量管理
                    </Button>
                  )}
                </div>
                {isManageMode ? (
                  <p className="text-xs text-stone-500">已选 {formatTokenCount(selectedCount)} 张（仅当前页）</p>
                ) : null}
              </div>
            </div>
          </CardHeader>
        </Card>

        {isLoading ? (
          <Card className="border-dashed border-stone-200/80 bg-white/75">
            <CardContent className="flex min-h-64 items-center justify-center gap-3 py-16 text-stone-500">
              <LoaderCircle className="size-5 animate-spin" />
              <span>正在读取 API 历史...</span>
            </CardContent>
          </Card>
        ) : pageRecords.length === 0 ? (
          <Card className="border-dashed border-stone-200/80 bg-white/75">
            <CardContent className="flex min-h-64 flex-col items-center justify-center gap-4 py-16 text-center text-stone-500">
              <div className="rounded-full bg-stone-100 p-4">
                <Sparkles className="size-5" />
              </div>
              <div>
                <p className="text-base font-medium text-stone-700">还没有 API 图片历史</p>
                <p className="mt-1 text-sm">等外部客户端通过图片接口生成成功后，这里会自动出现可回看的记录。</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {pageRecords.map((record) => {
                const firstImage = record.images?.[0];
                const cacheKey = firstImage ? buildCacheKey(record.id, firstImage.id) : "";
                const previewUrl = cacheKey ? thumbnailUrls[cacheKey] : "";
                const isOpening = loadingRecordId === record.id;
                const selectedInRecord = (record.images || []).reduce((sum, image) => {
                  return sum + (selectedImageKeySet.has(buildCacheKey(record.id, image.id)) ? 1 : 0);
                }, 0);

                return (
                  <Card key={record.id} className="overflow-hidden border-stone-200/80 bg-white/88">
                    {isManageMode ? (
                      <div className="relative flex aspect-[4/3] w-full items-stretch justify-stretch overflow-hidden bg-stone-100 p-3">
                        <div className="grid h-full w-full grid-cols-4 gap-2 overflow-auto rounded-2xl">
                          {(record.images || []).map((image) => {
                            const imageKey = buildCacheKey(record.id, image.id);
                            const src = thumbnailUrls[imageKey];
                            const isSelected = selectedImageKeySet.has(imageKey);
                            return (
                              <button
                                key={image.id}
                                type="button"
                                aria-pressed={isSelected}
                                onClick={() => toggleImageSelection(record.id, image.id)}
                                className={[
                                  "relative flex aspect-square items-center justify-center overflow-hidden rounded-xl bg-white/70 transition",
                                  isSelected
                                    ? "ring-2 ring-rose-500 ring-offset-2 ring-offset-stone-100"
                                    : "hover:ring-2 hover:ring-stone-300",
                                ].join(" ")}
                              >
                                {src ? (
                                  <img src={src} alt={record.prompt || "API 生成图片"} className="h-full w-full object-cover" />
                                ) : (
                                  <LoaderCircle className="size-4 animate-spin text-stone-500" />
                                )}
                                {isSelected ? (
                                  <span className="absolute right-2 top-2 inline-flex size-6 items-center justify-center rounded-full bg-rose-500 text-white shadow-sm">
                                    <Check className="size-4" />
                                  </span>
                                ) : null}
                              </button>
                            );
                          })}
                        </div>
                        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/70 via-black/25 to-transparent px-4 py-3 text-xs text-white">
                          <span>{record.model}</span>
                          <span>
                            {selectedInRecord > 0 ? `已选 ${selectedInRecord} / ` : ""}
                            {record.image_count} 张
                          </span>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void openRecordLightbox(record)}
                        className="group relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden bg-stone-100"
                      >
                        {previewUrl ? (
                          <img
                            src={previewUrl}
                            alt={record.prompt || "API 生成图片"}
                            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                          />
                        ) : (
                          <div className="flex items-center gap-2 text-sm text-stone-500">
                            <LoaderCircle className="size-4 animate-spin" />
                            <span>加载预览中</span>
                          </div>
                        )}
                        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/70 via-black/25 to-transparent px-4 py-3 text-xs text-white">
                          <span>{record.model}</span>
                          <span>{record.image_count} 张</span>
                        </div>
                      </button>
                    )}
                    <CardContent className="space-y-4 p-5">
                      <div className="space-y-2">
                        <div className="flex flex-wrap gap-2 text-xs">
                          <span className="rounded-full bg-stone-100 px-3 py-1 text-stone-600">
                            {record.mode === "edit" ? "编辑" : "生成"}
                          </span>
                          <span className="rounded-full bg-stone-100 px-3 py-1 text-stone-600">
                            {record.source_endpoint}
                          </span>
                          <span className="rounded-full bg-stone-100 px-3 py-1 text-stone-600">
                            {formatDateTime(record.created_at)}
                          </span>
                        </div>
                        <p className="line-clamp-3 text-sm leading-6 text-stone-700">
                          {record.prompt || "无提示词"}
                        </p>
                        <button
                          type="button"
                          className="text-xs font-medium text-stone-500 transition hover:text-stone-900"
                          onClick={() => setPromptRecord(record)}
                        >
                          查看完整提示词
                        </button>
                      </div>
                      <div className="flex items-center justify-between rounded-2xl bg-stone-50 px-4 py-3 text-xs text-stone-600">
                        <div className="flex items-center gap-2">
                          <Images className="size-4" />
                          <span>输入 {formatTokenCount(record.usage?.input_tokens || 0)}</span>
                        </div>
                        <span>输出 {formatTokenCount(record.usage?.output_tokens || 0)}</span>
                        <span>总计 {formatTokenCount(record.usage?.total_tokens || 0)}</span>
                      </div>
                      {isManageMode ? null : (
                        <div className="flex items-center gap-3">
                          <Button
                            type="button"
                            variant="outline"
                            className="flex-1 rounded-2xl border-stone-200 bg-white"
                            onClick={() => void openRecordLightbox(record)}
                            disabled={isOpening}
                          >
                            {isOpening ? <LoaderCircle className="size-4 animate-spin" /> : null}
                            查看图片
                          </Button>
                          {firstImage ? (
                            <Button
                              type="button"
                              variant="ghost"
                              className="rounded-2xl"
                              onClick={() => void handleDownload(record.id, firstImage)}
                            >
                              <Download className="size-4" />
                              下载首图
                            </Button>
                          ) : null}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <div className="flex items-center justify-between gap-3 rounded-3xl border border-white/70 bg-white/70 px-5 py-4">
              <p className="text-sm text-stone-500">
                第 {safePage} / {totalPages} 页，共 {formatTokenCount(records.length)} 条记录
              </p>
              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-2xl border-stone-200 bg-white"
                  disabled={safePage <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  上一页
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-2xl border-stone-200 bg-white"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                >
                  下一页
                </Button>
              </div>
            </div>
          </>
        )}
      </section>

      <ImageLightbox
        images={lightboxImages}
        currentIndex={lightboxIndex}
        open={lightboxOpen}
        onOpenChange={setLightboxOpen}
        onIndexChange={setLightboxIndex}
      />

      <Dialog open={!!promptRecord} onOpenChange={(open) => !open && setPromptRecord(null)}>
        <DialogContent className="w-[min(92vw,720px)]">
          <DialogHeader>
            <DialogTitle>完整提示词</DialogTitle>
            <DialogDescription>
              {promptRecord
                ? `${promptRecord.mode === "edit" ? "编辑" : "生成"} · ${promptRecord.source_endpoint} · ${formatDateTime(promptRecord.created_at)}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto rounded-3xl bg-stone-50 px-5 py-4 text-sm leading-7 whitespace-pre-wrap break-words text-stone-700">
            {promptRecord?.prompt || "无提示词"}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteConfirmOpen}
        onOpenChange={(open) => {
          if (isDeleting) {
            return;
          }
          setDeleteConfirmOpen(open);
        }}
      >
        <DialogContent className="w-[min(92vw,520px)]">
          <DialogHeader>
            <DialogTitle>确认删除所选图片？</DialogTitle>
            <DialogDescription>
              本次将删除当前页选中的 {formatTokenCount(selectedCount)} 张图片。删除后无法恢复。
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              className="rounded-2xl border-stone-200 bg-white"
              onClick={() => setDeleteConfirmOpen(false)}
              disabled={isDeleting}
            >
              取消
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="rounded-2xl"
              onClick={() => void runDeleteSelected()}
              disabled={isDeleting}
            >
              {isDeleting ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              确认删除
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
