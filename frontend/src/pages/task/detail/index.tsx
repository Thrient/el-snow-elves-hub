import { useEffect, useState, useRef, type FC } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button, Tag, Select, Input, Modal, message, Empty, Typography, Spin, Popconfirm, Upload } from "antd";
import {
  DownloadOutlined, LikeOutlined, LikeFilled, UserOutlined, ArrowLeftOutlined,
  CommentOutlined, SendOutlined, CalendarOutlined, FileOutlined,
  DeleteOutlined, EditOutlined, UploadOutlined, PictureOutlined, SwapOutlined,
  ClockCircleOutlined, CloudDownloadOutlined,
} from "@ant-design/icons";
import { taskApi } from "@/api/task";
import { uploadFile } from "@/api/storage";
import type { TaskItem, CommentItem } from "@/types";
import { useAuthStore } from "@/store/auth";

const { Title } = Typography;

const TaskDetailPage: FC = () => {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [task, setTask] = useState<TaskItem | null>(null);
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [commentText, setCommentText] = useState("");
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [editDesc, setEditDesc] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editTags, setEditTags] = useState("");
  const [coverUploading, setCoverUploading] = useState(false);
  const [coverRecordId, setCoverRecordId] = useState<number | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [replacingVersion, setReplacingVersion] = useState<number | null>(null);

  const handleReplaceFile = async (versionId: number) => {
    const input = fileInputRef.current;
    if (!input || !task) return;
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      setReplacingVersion(versionId);
      try {
        const result = await uploadFile(f);
        await taskApi.replaceVersionFile(task.id, versionId, {
          zip_fingerprint_id: result.fingerprint_id,
          filename: f.name,
        });
        message.success("文件已替换");
        load();
      } catch { message.error("替换失败"); }
      finally { setReplacingVersion(null); input.value = ""; input.onchange = null; }
    };
    input.click();
  };

  const load = async () => {
    if (!taskId) return;
    setLoading(true);
    try { const t = await taskApi.get(Number(taskId)); setTask(t); setComments(await taskApi.comments(Number(taskId))); setEditDesc(t.description || ""); setEditCategory(t.category || ""); setEditTags(t.tags || ""); }
    catch { /* ErrorToast */ }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [taskId]);

  const handleLike = async () => {
    if (!user) return message.warning("请先登录");
    if (!task) return;
    try {
      const result = await taskApi.like(task.id);
      setTask({ ...task, liked: result.liked, like_count: result.like_count });
    } catch { /* ErrorToast */ }
  };

  const handleComment = async () => {
    if (!user) return message.warning("请先登录");
    if (!commentText.trim() || !task) return;
    await taskApi.addComment(task.id, commentText.trim());
    setCommentText(""); message.success("评论已发布"); load();
  };

  const handleDelete = async () => {
    if (!task) return;
    await taskApi.delete(task.id);
    message.success("任务已删除"); navigate("/market");
  };

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><Spin size="large" /></div>;
  if (!task) return <Empty className="py-20" description="任务不存在" />;

  const isAuthor = user?.id === task.author_id;

  return (
    <div className="w-[min(92%,64rem)] mx-auto pt-6 pb-16">
      <style>{`
        @keyframes fade-up { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
        .animate-fade-up { animation: fade-up 0.45s ease-out both; }
        .animate-fade-in { animation: fade-in 0.3s ease-out both; }
        .cover-shadow { box-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04); }
      `}</style>

      {/* Back nav */}
      <button
        onClick={() => navigate("/market")}
        className="inline-flex items-center gap-1.5 text-[13px] text-[#9b8c7c] hover:text-[#d4513b] transition-colors mb-6 bg-transparent border-none cursor-pointer p-0"
      >
        <ArrowLeftOutlined className="text-[11px]" />
        返回市场
      </button>

      <div className="flex gap-8 flex-wrap lg:flex-nowrap">
        {/* ── Left: Cover + Content ── */}
        <div className="flex-1 min-w-0">
          {/* Cover */}
          <div
            className="relative rounded-2xl overflow-hidden cover-shadow animate-fade-up bg-[#f5f0e8]"
            style={{ aspectRatio: "16/9", maxHeight: 360 }}
          >
            {task.cover_url ? (
              <img src={task.cover_url} alt={task.title} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-[linear-gradient(145deg,#f8f3ec,#efe8dc)]">
                <FileOutlined className="text-[2.5rem] text-[#d4c8b8]" />
                <span className="text-[13px] text-[#c4b8a8]">暂无封面</span>
              </div>
            )}
          </div>

          {/* Meta row */}
          <div className="flex items-center gap-2 flex-wrap mt-5 mb-3 animate-fade-up" style={{ animationDelay: "0.1s" }}>
            <Tag className="!rounded-full !border-none !bg-[#fef3ef] !text-[#d4513b] !px-3 !py-0.5 !text-[12px] !font-500">
              {task.category}
            </Tag>
            {task.tags?.split(",").filter(Boolean).map((t) => (
              <Tag key={t} className="!rounded-full !bg-[#f7f4f0] !text-[#7a6e62] !border !border-[#e8e2d8] !px-2.5 !py-0.5 !text-[11px]">
                {t.trim()}
              </Tag>
            ))}
          </div>

          {/* Title */}
          <Title level={3} className="!text-[#3d3630] !mb-2 !text-[1.5rem] !font-700 !tracking-tight animate-fade-up" style={{ animationDelay: "0.15s" }}>
            {task.title}
          </Title>

          {/* Stats row */}
          <div className="flex items-center gap-4 text-[12px] text-[#b0a495] mb-5 animate-fade-up" style={{ animationDelay: "0.2s" }}>
            <span className="flex items-center gap-1"><CalendarOutlined />{new Date(task.created_at).toLocaleDateString("zh-CN")}</span>
            {task.file_size != null && <span className="flex items-center gap-1"><FileOutlined />{(task.file_size / 1024).toFixed(0)} KB</span>}
            <span className="flex items-center gap-1"><CloudDownloadOutlined />{task.download_count.toLocaleString()} 下载</span>
          </div>

          {/* Description */}
          <div className="text-[14px] text-[#6b5e55] leading-7 mb-8 whitespace-pre-line animate-fade-up" style={{ animationDelay: "0.25s" }}>
            {task.description || "暂无描述"}
          </div>

          {/* Action bar */}
          <div className="flex items-center gap-3 flex-wrap mb-8 animate-fade-up" style={{ animationDelay: "0.3s" }}>
            <Button
              type="primary"
              size="large"
              icon={<DownloadOutlined />}
              href={taskApi.download(task.id)} target="_blank"
              className="!rounded-xl !h-11 !px-6 !font-600 !border-none !text-[15px]"
              style={{ background: "linear-gradient(135deg, #d4513b, #c4402a)", boxShadow: "0 4px 16px rgba(212,81,59,0.3)" }}
            >
              下载最新版 ({task.download_count.toLocaleString()})
            </Button>
            <Button
              size="large"
              className="!rounded-xl !h-11 !px-5 !font-500"
              icon={task.liked ? <LikeFilled className="!text-[#d4513b]" /> : <LikeOutlined />}
              onClick={handleLike}
            >
              {task.liked ? "已点赞" : "点赞"} ({task.like_count.toLocaleString()})
            </Button>
            {isAuthor && (
              <>
                <div className="w-px h-7 bg-[#e8e2d8] mx-1" />
                <Button size="large" icon={<EditOutlined />} className="!rounded-xl !h-11 !px-5 !font-500"
                  onClick={() => {
                    setEditDesc(task.description || "");
                    setEditCategory(task.category || "");
                    setEditTags(task.tags || "");
                    setCoverRecordId(null);
                    setCoverPreview(null);
                    setEditOpen(true);
                  }}>编辑</Button>
                <Button size="large" icon={<UploadOutlined />} className="!rounded-xl !h-11 !px-5 !font-500"
                  onClick={() => navigate(`/upload?taskId=${task.id}&taskName=${encodeURIComponent(task.title)}&mode=version`)}>
                  新版本
                </Button>
                <Popconfirm title="确定删除此任务？" description="删除后无法恢复"
                  onConfirm={handleDelete} okText="删除" cancelText="取消" okButtonProps={{ danger: true }}>
                  <Button size="large" danger icon={<DeleteOutlined />} className="!rounded-xl !h-11 !px-5 !font-500">删除</Button>
                </Popconfirm>
              </>
            )}
          </div>

          {/* Version history */}
          {task.versions && task.versions.length > 0 && (
            <div className="mb-8 animate-fade-up" style={{ animationDelay: "0.35s" }}>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-1 h-6 rounded-full bg-[#d4513b]" />
                <Title level={5} className="!text-[#3d3630] !mt-0 !mb-0 !font-600 !text-[15px]">版本历史</Title>
                <span className="text-[11px] text-[#b8afa6] bg-[#f5f2ee] px-2 py-0.5 rounded-full">{task.versions.length}</span>
              </div>
              <div className="flex flex-col gap-2">
                {task.versions.map((v) => (
                  <div
                    key={v.id}
                    className="group flex items-center gap-4 p-4 rounded-xl bg-white border border-[#f0ebe3] transition-all duration-200 hover:border-[#e0d5c5] hover:shadow-sm"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span className="shrink-0 inline-flex items-center justify-center w-16 h-8 rounded-lg bg-[#fef5f2] text-[#d4513b] text-[12px] font-700 font-mono border border-[#fde8e0]">
                        v{v.version}
                      </span>
                      {v.created_at && (
                        <span className="text-[11px] text-[#b8afa6] flex items-center gap-1 shrink-0">
                          <ClockCircleOutlined className="text-[10px]" />
                          {new Date(v.created_at).toLocaleDateString("zh-CN")}
                        </span>
                      )}
                      {v.file_size != null && (
                        <span className="text-[11px] text-[#b8afa6] shrink-0 font-mono">
                          {(v.file_size / 1024).toFixed(0)} KB
                        </span>
                      )}
                      {v.changelog && (
                        <span className="text-[12px] text-[#8b7e6e] truncate min-w-0">{v.changelog}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button type="default" size="small" icon={<DownloadOutlined />}
                        href={taskApi.download(task.id, v.version)} target="_blank"
                        className="!rounded-lg !h-8 !text-[12px] !border-[#e8e2d8] !text-[#6b5e55] hover:!text-[#d4513b] hover:!border-[#d4513b]">
                        下载
                      </Button>
                      {isAuthor && (
                        <Button type="default" size="small" icon={<SwapOutlined />}
                          loading={replacingVersion === v.id}
                          onClick={() => handleReplaceFile(v.id)}
                          className="!rounded-lg !h-8 !text-[12px] !border-[#ffe8d0] !text-[#e0883a] hover:!border-[#fa8c16] hover:!text-[#d46b08]">
                          替换
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Comments */}
          <div className="mt-12 animate-fade-up" style={{ animationDelay: "0.4s" }}>
            <div className="flex items-center gap-2 mb-5">
              <div className="w-1 h-6 rounded-full bg-[#d4513b]" />
              <Title level={4} className="!text-[#3d3630] !mt-0 !mb-0 !font-600 !text-[16px]">
                <CommentOutlined className="mr-2" />评论 ({comments.length})
              </Title>
            </div>

            {comments.length === 0 ? (
              <Empty description="暂无评论，来说两句吧" image={Empty.PRESENTED_IMAGE_SIMPLE} className="py-8" />
            ) : (
              <div className="flex flex-col gap-3 mb-6">
                {comments.map((c) => (
                  <div key={c.id} className="p-4 rounded-xl bg-white border border-[#f0ebe3]">
                    <div className="flex items-center gap-2.5 mb-2">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center overflow-hidden bg-[linear-gradient(135deg,#f5f0e8,#e8e3dc)] shrink-0">
                        {c.user_avatar_url ? (
                          <img src={`${c.user_avatar_url}?q=50`} alt="" className="w-full h-full rounded-full object-cover" />
                        ) : (
                          <UserOutlined className="text-[13px] text-[#b8afa6]" />
                        )}
                      </div>
                      <span className="font-600 text-[13px] text-[#3d3630]">{c.user_name}</span>
                      <span className="text-[11px] text-[#c4bbb2]">{new Date(c.created_at).toLocaleString("zh-CN")}</span>
                    </div>
                    <div className="text-[13px] text-[#6b5e55] leading-7 ml-10.5">{c.content}</div>
                  </div>
                ))}
              </div>
            )}

            {user ? (
              <div className="flex gap-2.5">
                <Input.TextArea rows={2} placeholder="写下你的评论..." value={commentText}
                  onChange={(e) => setCommentText(e.target.value)} className="!rounded-xl" />
                <Button type="primary" icon={<SendOutlined />} onClick={handleComment}
                  className="!rounded-xl self-end">发送</Button>
              </div>
            ) : (
              <div className="text-center py-5 rounded-xl bg-[#faf8f5] border border-[#f0ede8] text-[13px] text-[#b8afa6]">
                请 <Button type="link" size="small" onClick={() => navigate("/login")} className="!p-0">登录</Button> 后发表评论
              </div>
            )}
          </div>
        </div>

        {/* ── Right: Author sidebar ── */}
        <div className="w-70 shrink-0 hidden lg:block" style={{ animation: "fade-up 0.45s ease-out 0.2s both" }}>
          <div className="sticky top-20 p-6 rounded-2xl bg-white border border-[#f0ebe3] cover-shadow">
            {/* Author */}
            <div className="text-center pb-5 border-b border-[#f5f0e8] mb-5">
              <div className="w-16 h-16 rounded-full mx-auto mb-3 flex items-center justify-center overflow-hidden bg-[linear-gradient(135deg,#f5f0e8,#e8e3dc)] ring-2 ring-[#f5f0e8] ring-offset-2">
                {task.author_avatar_url ? (
                  <img src={task.author_avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <UserOutlined className="text-[1.5rem] text-[#b8afa6]" />
                )}
              </div>
              <div className="font-600 text-[15px] text-[#3d3630]">{task.author_name}</div>
              <div className="text-[12px] text-[#b8afa6] mt-0.5">任务作者</div>
            </div>

            {/* Stats */}
            <div className="flex justify-center gap-8 mb-4">
              <div className="text-center">
                <div className="text-xl font-700 text-[#3d3630]">{task.download_count.toLocaleString()}</div>
                <div className="text-[11px] text-[#b8afa6] mt-0.5">下载</div>
              </div>
              <div className="text-center">
                <div className="text-xl font-700 text-[#3d3630]">{task.like_count.toLocaleString()}</div>
                <div className="text-[11px] text-[#b8afa6] mt-0.5">点赞</div>
              </div>
            </div>

            <Button
              type="default"
              block
              className="!rounded-xl !font-500 !text-[13px] !border-[#e8e2d8] !text-[#6b5e55] hover:!border-[#d4513b] hover:!text-[#d4513b]"
              onClick={() => navigate(`/user/${task.author_id}`)}
            >
              查看作者主页 →
            </Button>

            {/* Task info card */}
            <div className="mt-5 pt-5 border-t border-[#f5f0e8]">
              <div className="text-[11px] text-[#b8afa6] font-500 mb-3">任务信息</div>
              <div className="flex flex-col gap-2.5 text-[12px] text-[#6b5e55]">
                <div className="flex justify-between">
                  <span className="text-[#b8afa6]">版本</span>
                  <span className="font-600">{task.version}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#b8afa6]">文件大小</span>
                  <span className="font-600">{task.file_size != null ? `${(task.file_size / 1024).toFixed(0)} KB` : "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#b8afa6]">发布</span>
                  <span className="font-600">{new Date(task.created_at).toLocaleDateString("zh-CN")}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile author card */}
      <div className="lg:hidden mt-6 p-5 rounded-2xl bg-white border border-[#f0ebe3] animate-fade-up" style={{ animationDelay: "0.2s" }}>
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full flex items-center justify-center overflow-hidden bg-[linear-gradient(135deg,#f5f0e8,#e8e3dc)] shrink-0">
            {task.author_avatar_url ? (
              <img src={task.author_avatar_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <UserOutlined className="text-[1.2rem] text-[#b8afa6]" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-600 text-[14px] text-[#3d3630]">{task.author_name}</div>
            <div className="text-[12px] text-[#b8afa6]">任务作者 · v{task.version}</div>
          </div>
          <div className="flex gap-4 text-center">
            <div><div className="font-700 text-[#3d3630]">{task.download_count.toLocaleString()}</div><div className="text-[10px] text-[#b8afa6]">下载</div></div>
            <div><div className="font-700 text-[#3d3630]">{task.like_count.toLocaleString()}</div><div className="text-[10px] text-[#b8afa6]">点赞</div></div>
          </div>
        </div>
      </div>

      {/* Edit modal */}
      <Modal
        title={<span className="text-[16px] font-600 text-[#3d3630]">编辑任务</span>}
        open={editOpen}
        onCancel={() => setEditOpen(false)}
        onOk={async () => {
          if (!task) return;
          try {
            const fd = new FormData();
            fd.append("description", editDesc);
            fd.append("category", editCategory);
            fd.append("tags", editTags);
            if (coverRecordId != null) fd.append("cover_fingerprint_id", String(coverRecordId));
            await taskApi.update(task.id, fd);
            message.success("任务已更新");
            setEditOpen(false);
            load();
          } catch { /* ErrorToast */ }
        }}
        okText="保存"
        cancelText="取消"
        width={520}
        centered
        classNames={{ body: "!pt-4 !pb-2", header: "!mb-0" }}
      >
        <div className="flex flex-col gap-5">
          {/* Cover */}
          <div>
            <span className="text-[13px] font-600 text-[#3d3630] block mb-2">封面图</span>
            <Upload
              accept="image/*"
              maxCount={1}
              showUploadList={false}
              className="[&_.ant-upload-select]:!block [&_.ant-upload-select]:!w-full"
              beforeUpload={(f) => {
                setCoverPreview(URL.createObjectURL(f));
                setCoverUploading(true);
                uploadFile(f).then((r) => setCoverRecordId(r.fingerprint_id))
                  .catch(() => { setCoverPreview(null); message.error("封面上传失败"); })
                  .finally(() => setCoverUploading(false));
                return false;
              }}
            >
              {(coverPreview || task.cover_url) ? (
                <div className="group relative rounded-xl overflow-hidden border border-[#f0ebe3] bg-[#faf8f5] cursor-pointer">
                  <img src={coverPreview || task.cover_url!} alt="" className="w-full object-cover" style={{ maxHeight: 180 }} />
                  {/* Overlay on hover */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center gap-2">
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity text-white text-[12px] font-500 bg-black/50 px-3 py-1.5 rounded-full">
                      <PictureOutlined className="mr-1" />更换封面
                    </span>
                    <span
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-white text-[12px] font-500 bg-red-500/70 px-3 py-1.5 rounded-full cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        setCoverPreview(null);
                        setCoverRecordId(null);
                      }}
                    >
                      <DeleteOutlined className="mr-1" />移除
                    </span>
                  </div>
                  {coverUploading && (
                    <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
                      <Spin size="small" />
                    </div>
                  )}
                </div>
              ) : (
                <div className="w-full rounded-xl border-2 border-dashed border-[#d4c8b8] bg-[#faf8f5] flex flex-col items-center justify-center py-12 cursor-pointer hover:border-[#d4513b] hover:bg-[#fef5f2] transition-colors">
                  {coverUploading ? (
                    <Spin size="small" />
                  ) : (
                    <>
                      <PictureOutlined className="text-[2rem] text-[#c4b8a8] mb-2" />
                      <span className="text-[13px] text-[#b8a898]">点击上传封面</span>
                      <span className="text-[11px] text-[#d4c8b8] mt-1">支持 PNG / JPEG / GIF</span>
                    </>
                  )}
                </div>
              )}
            </Upload>
          </div>

          {/* Description */}
          <div>
            <span className="text-[13px] font-600 text-[#3d3630] block mb-2">描述</span>
            <Input.TextArea rows={4} value={editDesc} onChange={(e) => setEditDesc(e.target.value)}
              className="!rounded-xl" placeholder="介绍你的任务..." />
          </div>

          {/* Category + Tags row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="text-[13px] font-600 text-[#3d3630] block mb-2">分类</span>
              <Select value={editCategory} onChange={setEditCategory} className="w-full !rounded-xl" size="large"
                options={[{ label: "综合", value: "综合" }]} />
            </div>
            <div>
              <span className="text-[13px] font-600 text-[#3d3630] block mb-2">标签</span>
              <Input placeholder="逗号分隔" value={editTags} onChange={(e) => setEditTags(e.target.value)}
                className="!rounded-xl" size="large" />
            </div>
          </div>
        </div>
      </Modal>

      <input ref={fileInputRef} type="file" accept=".zip" hidden />
    </div>
  );
};

export const page = "TaskDetailPage";
export default TaskDetailPage;
