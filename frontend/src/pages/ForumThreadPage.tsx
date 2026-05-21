import { useEffect, useState, useRef, type FC } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button, Typography, Spin, Input, message, Dropdown, Modal, Tag } from "antd";
import {
  ArrowLeftOutlined, UserOutlined, ClockCircleOutlined, EyeOutlined,
  MessageOutlined, PushpinOutlined, LockOutlined, SendOutlined,
  MoreOutlined, EditOutlined, DeleteOutlined, PictureOutlined,
  HeartOutlined, HeartFilled,
} from "@ant-design/icons";
import { forumApi, type ThreadDetail } from "../api/forum";
import { useAuthStore } from "../store/auth";

const { Title } = Typography;

const MAX_QUOTE_LEN = 80;

const ForumThreadPage: FC = () => {
  const { threadId } = useParams<{ threadId: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const hasPerm = useAuthStore((s) => s.hasPerm);
  const [thread, setThread] = useState<ThreadDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [replyText, setReplyText] = useState("");
  const [replyImages, setReplyImages] = useState<File[]>([]);
  const [replyUploading, setReplyUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [replyingTo, setReplyingTo] = useState<{ id: number; floor: number; author: string } | null>(null);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [likedPosts, setLikedPosts] = useState<Set<number>>(new Set());
  const loadedRef = useRef<string | null>(null);

  const load = () => {
    if (!threadId) return;
    if (loadedRef.current === threadId) return;
    loadedRef.current = threadId;
    setLoading(true);
    forumApi.getThread(Number(threadId)).then(setThread).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [threadId]);

  const scrollToFloor = (floorId: number) => {
    const el = document.getElementById(`floor-${floorId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.style.transition = "box-shadow .4s";
      el.style.boxShadow = "0 0 0 3px #d4513b44";
      setTimeout(() => { el.style.boxShadow = ""; }, 1500);
    }
  };

  const handleReplyImages = async (files: File[]): Promise<number[]> => {
    if (files.length === 0) return [];
    setReplyUploading(true);
    try {
      const ids = await Promise.all(files.map(async (f) => {
        const res = await forumApi.uploadImage(f);
        return res.file_id;
      }));
      return ids;
    } catch {
      message.error("图片上传失败");
      return [];
    } finally {
      setReplyUploading(false);
    }
  };

  const handleReply = async () => {
    if (!replyText.trim() || !thread) return;
    setSubmitting(true);
    try {
      const imgIds = await handleReplyImages(replyImages);
      await forumApi.createReply(thread.id, replyText.trim(), replyingTo?.id, imgIds);
      setReplyText("");
      setReplyImages([]);
      setReplyingTo(null);
      message.success("回复成功");
      loadedRef.current = null;
      load();
    } catch { message.error("回复失败"); }
    finally { setSubmitting(false); }
  };

  const handleEdit = async () => {
    if (!editId) return;
    try {
      await forumApi.updateThread(editId, { content: editContent });
      message.success("已更新");
      setEditing(false);
      loadedRef.current = null;
      load();
    } catch { message.error("编辑失败"); }
  };

  const handleDelete = async (id: number, isThread: boolean) => {
    Modal.confirm({
      title: "确认删除？", content: "删除后无法恢复",
      onOk: async () => {
        try {
          await forumApi.deleteThread(id);
          message.success("已删除");
          if (isThread) navigate(-1);
          else { loadedRef.current = null; load(); }
        } catch { message.error("删除失败"); }
      },
      okText: "删除", cancelText: "取消", okButtonProps: { danger: true },
    });
  };

  const handleLike = async (postId: number) => {
    if (!user) { message.info("请先登录"); return; }
    try {
      const res = await forumApi.likePost(postId);
      setLikedPosts((prev) => {
        const next = new Set(prev);
        if (res.data.liked) next.add(postId);
        else next.delete(postId);
        return next;
      });
      // Update count locally
      if (thread) {
        if (thread.id === postId) {
          setThread({ ...thread, like_count: res.data.like_count });
        } else {
          setThread({
            ...thread,
            replies: thread.replies.map((r) =>
              r.id === postId ? { ...r, like_count: res.data.like_count } : r
            ),
          });
        }
      }
    } catch { message.error("操作失败"); }
  };

  const handleAdminAction = async (action: "pin" | "unpin" | "lock" | "unlock") => {
    if (!thread) return;
    try {
      await forumApi.adminAction(thread.id, action);
      message.success("操作成功");
      loadedRef.current = null;
      load();
    } catch { message.error("操作失败"); }
  };

  const timeStr = (date: string) => {
    const d = new Date(date);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60000) return "刚刚";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
    return d.toLocaleDateString("zh-CN") + " " + d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  };

  const floorIndex = (idx: number) => idx + 2; // #2, #3, ...

  if (loading) return <div style={{ textAlign: "center", padding: 80 }}><Spin size="large" /></div>;
  if (!thread) return <div style={{ textAlign: "center", padding: 80, color: "#b8afa6" }}>帖子不存在</div>;

  const canManage = hasPerm("forum:manage");
  const isThreadAuthor = user?.id === thread.author?.id;

  return (
    <div style={{ maxWidth: 860, margin: "0 auto" }}>
      {/* Navigation */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <Button type="text" icon={<ArrowLeftOutlined />}
          onClick={() => navigate(-1)}
          style={{ color: "#b8afa6", padding: 0, fontWeight: 500 }}>
          返回
        </Button>
        <span style={{ fontSize: 12, color: "#c4bbb2" }}>{thread.board_name}</span>
      </div>

      {/* #1 楼主 */}
      <div id="floor-1" style={{
        padding: "24px 28px", borderRadius: 16, marginBottom: 8,
        background: "#fff", border: "1px solid #e8e3dc",
      }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          paddingBottom: 16, marginBottom: 16,
          borderBottom: "1px solid #f0ede8",
        }}>
          <div style={{
            width: 48, height: 48, borderRadius: "50%", flexShrink: 0,
            background: "linear-gradient(135deg, #f5f0e8, #ebe4d8)",
            display: "flex", alignItems: "center", justifyContent: "center",
            border: "2px solid #f0ede8",
          }}>
            {thread.author?.avatar_url ? (
              <img src={thread.author.avatar_url} alt="" style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} />
            ) : (
              <UserOutlined style={{ fontSize: 20, color: "#b8afa6" }} />
            )}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: "#3d3630" }}>
              {thread.author?.username || "匿名"}
              <span style={{ fontSize: 11, fontWeight: 400, color: "#b8afa6", marginLeft: 8 }}>#1 楼主</span>
            </div>
            <div style={{ fontSize: 12, color: "#b8afa6", marginTop: 2 }}>
              <ClockCircleOutlined style={{ marginRight: 4 }} />{timeStr(thread.created_at)}
              {thread.updated_at && thread.updated_at !== thread.created_at && (
                <span style={{ marginLeft: 8, fontSize: 11, color: "#c4bbb2" }}>(已编辑)</span>
              )}
              <span style={{ margin: "0 8px", color: "#d9cfc4" }}>·</span>
              <EyeOutlined style={{ marginRight: 4 }} />{thread.view_count.toLocaleString()} 阅读
              <span style={{ margin: "0 8px", color: "#d9cfc4" }}>·</span>
              <MessageOutlined style={{ marginRight: 4 }} />{thread.reply_count.toLocaleString()} 回复
            </div>
          </div>
          <Button
            type="text" size="small"
            icon={likedPosts.has(thread.id) ? <HeartFilled style={{ color: "#d4513b" }} /> : <HeartOutlined />}
            onClick={() => handleLike(thread.id)}
            style={{ color: likedPosts.has(thread.id) ? "#d4513b" : "#b8afa6", fontSize: 13, fontWeight: 500 }}
          >
            {thread.like_count || 0}
          </Button>
          {(canManage || isThreadAuthor) && (
            <Dropdown menu={{ items: [
              ...(canManage ? [
                { key: "pin", icon: <PushpinOutlined />, label: thread.is_pinned ? "取消置顶" : "置顶", onClick: () => handleAdminAction(thread.is_pinned ? "unpin" : "pin") },
                { key: "lock", icon: <LockOutlined />, label: thread.is_locked ? "解除锁定" : "锁定", onClick: () => handleAdminAction(thread.is_locked ? "unlock" : "lock") },
                { type: "divider" as const },
              ] : []),
              ...(isThreadAuthor ? [
                { key: "edit", icon: <EditOutlined />, label: "编辑", onClick: () => { setEditId(thread.id); setEditContent(thread.content); setEditing(true); } },
                { key: "delete", icon: <DeleteOutlined />, label: "删除", danger: true, onClick: () => handleDelete(thread.id, true) },
              ] : []),
            ]}}>
              <Button type="text" size="small" icon={<MoreOutlined />} />
            </Dropdown>
          )}
        </div>

        {thread.title && (
          <Title level={3} style={{ color: "#3d3630", margin: "0 0 16px", fontSize: 20, fontWeight: 700 }}>
            {thread.is_pinned && <PushpinOutlined style={{ color: "#f59e0b", marginRight: 6, fontSize: 16 }} />}
            {thread.is_locked && <LockOutlined style={{ color: "#b8afa6", marginRight: 6, fontSize: 16 }} />}
            {thread.title}
          </Title>
        )}

        <div style={{ fontSize: 15, color: "#4a423b", lineHeight: 2, whiteSpace: "pre-wrap" }}>
          {thread.content}
        </div>

        {thread.image_urls && thread.image_urls.length > 0 && (
          <div style={{
            display: "grid", marginTop: 20,
            gridTemplateColumns: `repeat(${Math.min(thread.image_urls.length, 3)}, 1fr)`,
            gap: 10,
          }}>
            {thread.image_urls.map((url, i) => (
              <div key={i} style={{
                borderRadius: 10, overflow: "hidden", aspectRatio: "16/10",
                background: "#f3f0ec", cursor: "zoom-in",
              }}>
                <img src={url} alt="" loading="lazy"
                  style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Replies (楼层) */}
      <div style={{ marginBottom: 24 }}>
        {thread.replies.length === 0 ? (
          <div style={{
            textAlign: "center", padding: 40, borderRadius: 14,
            color: "#b8afa6", fontSize: 13,
            background: "#faf8f5", border: "1px solid #f0ede8",
          }}>
            <MessageOutlined style={{ fontSize: 24, color: "#d4c8b8", marginBottom: 8, display: "block" }} />
            暂无回复，来说两句吧
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {thread.replies.map((r, idx) => {
              const floorNum = floorIndex(idx);
              const isReplyAuthor = user?.id === r.author?.id;
              return (
                <div key={r.id} id={`floor-${floorNum}`} style={{
                  padding: "16px 20px", borderRadius: 12,
                  background: "#fff", border: "1px solid #e8e3dc",
                  scrollMarginTop: 80,
                }}>
                  {/* Quote block */}
                  {r.parent_id && r.parent_content && (
                    <div
                      onClick={() => {
                        // Find the floor number for parent_id
                        const parentIdx = thread.replies.findIndex((x) => x.id === r.parent_id);
                        const parentFloor = parentIdx === -1 ? 1 : floorIndex(parentIdx);
                        scrollToFloor(parentFloor);
                      }}
                      style={{
                        padding: "8px 12px", marginBottom: 10, borderRadius: 8,
                        background: "#f8f6f2", borderLeft: "3px solid #d4513b",
                        cursor: "pointer", transition: "background .2s",
                        fontSize: 12, color: "#6b5e55", lineHeight: 1.6,
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "#f3f0e9"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "#f8f6f2"; }}
                    >
                      <span style={{ fontWeight: 600, color: "#d4513b" }}>↑回复 #{r.parent_id === thread.id ? "1" : ""}{r.parent_author && `${r.parent_author}`}</span>
                      <span style={{ color: "#b8afa6", marginLeft: 6 }}>
                        「{r.parent_content.length > MAX_QUOTE_LEN ? r.parent_content.slice(0, MAX_QUOTE_LEN) + "..." : r.parent_content}」
                      </span>
                    </div>
                  )}

                  {/* Floor header */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                    <div style={{
                      width: 34, height: 34, borderRadius: "50%", flexShrink: 0,
                      background: "linear-gradient(135deg, #f3f0ec, #e8e3dc)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {r.author?.avatar_url ? (
                        <img src={r.author.avatar_url} alt="" style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} />
                      ) : (
                        <UserOutlined style={{ fontSize: 14, color: "#b8afa6" }} />
                      )}
                    </div>
                    <span style={{ fontWeight: 600, fontSize: 13, color: "#3d3630" }}>
                      {r.author?.username || "匿名"}
                    </span>
                    {r.author?.id === thread.author?.id && (
                      <Tag style={{ fontSize: 10, lineHeight: "16px", borderRadius: 3, padding: "0 4px", margin: 0, background: "#fef3ef", color: "#d4513b", border: "none" }}>
                        楼主
                      </Tag>
                    )}
                    <span style={{ marginLeft: "auto", fontSize: 11, color: "#c4bbb2" }}>
                      #{floorNum} · {timeStr(r.created_at)}
                      {r.updated_at && r.updated_at !== r.created_at && (
                        <span style={{ marginLeft: 4, fontSize: 10, color: "#d9cfc4" }}>(已编辑)</span>
                      )}
                    </span>
                  </div>

                  {/* Content */}
                  <div style={{ marginLeft: 44 }}>
                    <div style={{ fontSize: 14, color: "#4a423b", lineHeight: 1.8, whiteSpace: "pre-wrap", marginBottom: r.image_urls?.length ? 10 : 0 }}>
                      {r.content}
                    </div>
                    {r.image_urls && r.image_urls.length > 0 && (
                      <div style={{
                        display: "grid",
                        gridTemplateColumns: `repeat(${Math.min(r.image_urls.length, 3)}, 1fr)`,
                        gap: 8,
                      }}>
                        {r.image_urls.map((url, i) => (
                          <div key={i} style={{ borderRadius: 8, overflow: "hidden", aspectRatio: "16/10", background: "#f3f0ec" }}>
                            <img src={url} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Actions: like, reply, edit, delete */}
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 10 }}>
                      <Button
                        type="text" size="small"
                        icon={likedPosts.has(r.id) ? <HeartFilled style={{ color: "#d4513b" }} /> : <HeartOutlined />}
                        onClick={() => handleLike(r.id)}
                        style={{ color: likedPosts.has(r.id) ? "#d4513b" : "#b8afa6", fontSize: 12, padding: "0 4px" }}
                      >
                        {r.like_count || 0}
                      </Button>
                      {!thread.is_locked && user && (
                        <Button type="text" size="small"
                          onClick={() => { setReplyingTo({ id: r.id, floor: floorNum, author: r.author?.username || "匿名" }); setReplyText(""); setReplyImages([]); }}
                          style={{ color: "#6b5e55", fontSize: 12, padding: "0 4px" }}>
                          <MessageOutlined style={{ marginRight: 2 }} />回复
                        </Button>
                      )}
                      {(canManage || isReplyAuthor) && (
                        <span style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
                          {isReplyAuthor && (
                            <Button type="text" size="small" icon={<EditOutlined />}
                              onClick={() => { setEditId(r.id); setEditContent(r.content); setEditing(true); }}
                              style={{ color: "#b8afa6", fontSize: 11 }} />
                          )}
                          <Button type="text" size="small" danger icon={<DeleteOutlined />}
                            onClick={() => handleDelete(r.id, false)}
                            style={{ fontSize: 11 }} />
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Reply box */}
      {thread.is_locked ? (
        <div style={{
          textAlign: "center", padding: 16, borderRadius: 12,
          background: "#fff", border: "1px solid #e8e3dc",
          color: "#b8afa6", fontSize: 13,
        }}>
          <LockOutlined style={{ marginRight: 6 }} />此帖已锁定，无法回复
        </div>
      ) : user ? (
        <div style={{ padding: 20, borderRadius: 14, background: "#fff", border: "1px solid #e8e3dc" }}>
          {replyingTo && (
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "6px 12px", marginBottom: 10, borderRadius: 8,
              background: "#fef3ef", fontSize: 12, color: "#d4513b",
            }}>
              <span>回复 #{replyingTo.floor} @{replyingTo.author}</span>
              <Button type="text" size="small" style={{ color: "#b8afa6", fontSize: 11, marginLeft: "auto" }}
                onClick={() => setReplyingTo(null)}>× 取消</Button>
            </div>
          )}
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{
              width: 38, height: 38, borderRadius: "50%", flexShrink: 0,
              background: "linear-gradient(135deg, #f3f0ec, #e8e3dc)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <UserOutlined style={{ fontSize: 15, color: "#b8afa6" }} />
            </div>
            <div style={{ flex: 1 }}>
              <Input.TextArea
                rows={3}
                placeholder="写下你的回复..."
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                style={{ borderRadius: 10, marginBottom: 10 }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <label style={{ cursor: "pointer", fontSize: 12, color: "#6b5e55", display: "flex", alignItems: "center", gap: 4 }}>
                  <PictureOutlined />
                  添加图片
                  <input type="file" multiple accept="image/*" style={{ display: "none" }}
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      setReplyImages((prev) => [...prev, ...files]);
                    }} />
                </label>
                {replyImages.length > 0 && (
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap", flex: 1, marginLeft: 12 }}>
                    {replyImages.map((f, i) => (
                      <div key={i} style={{
                        position: "relative", width: 32, height: 32, borderRadius: 6, overflow: "hidden",
                        border: "1px solid #e8e3dc",
                      }}>
                        <img src={URL.createObjectURL(f)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        <div onClick={() => setReplyImages((prev) => prev.filter((_, j) => j !== i))}
                          style={{
                            position: "absolute", inset: 0, background: "rgba(0,0,0,.4)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            cursor: "pointer", color: "#fff", fontSize: 10, opacity: 0, transition: "opacity .2s",
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.opacity = "0"; }}
                        >×</div>
                      </div>
                    ))}
                  </div>
                )}
                <Button
                  type="primary" icon={<SendOutlined />}
                  loading={submitting || replyUploading}
                  onClick={handleReply}
                  style={{ borderRadius: 8 }}
                >
                  回复
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div style={{
          textAlign: "center", padding: 16, borderRadius: 12,
          background: "#fff", border: "1px solid #e8e3dc",
          color: "#b8afa6", fontSize: 13,
        }}>
          请 <Button type="link" size="small" onClick={() => navigate("/login")} style={{ padding: 0 }}>登录</Button> 后参与讨论
        </div>
      )}

      {/* Edit modal */}
      <Modal
        title="编辑"
        open={editing}
        onCancel={() => setEditing(false)}
        onOk={handleEdit}
        okText="保存"
        cancelText="取消"
        width={560}
      >
        <div style={{ padding: "8px 0" }}>
          <Input.TextArea rows={6} value={editContent} onChange={(e) => setEditContent(e.target.value)} style={{ borderRadius: 8 }} placeholder="内容" />
        </div>
      </Modal>
    </div>
  );
};

export default ForumThreadPage;
