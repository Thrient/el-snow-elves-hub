import { useEffect, useState, useRef, type FC } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button, Spin, Input, message, Modal } from "antd";
import { ArrowLeftOutlined, MessageOutlined } from "@ant-design/icons";
import { forumApi } from "@/api/forum";
import type { ThreadDetail, ReplyItem } from "@/types";
import { useAuthStore } from "@/store/auth";
import PostDetail from "@/pages/forum/components/PostDetail";
import ReplyCard from "@/pages/forum/components/ReplyCard";
import ReplyBox from "@/pages/forum/components/ReplyBox";

const ForumThreadPage: FC = () => {
  const { threadId } = useParams<{ threadId: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const hasPerm = useAuthStore((s) => s.hasPerm);

  const [thread, setThread] = useState<ThreadDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [replyText, setReplyText] = useState("");
  const [replyImages, setReplyImages] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [replyingTo, setReplyingTo] = useState<{ id: number; floor: number; author: string } | null>(null);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const loadedRef = useRef<string | null>(null);

  const load = () => {
    if (!threadId || loadedRef.current === threadId) return;
    loadedRef.current = threadId;
    setLoading(true);
    forumApi.getThread(Number(threadId)).then(setThread).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [threadId]);

  const scrollToFloor = (floorId: number) => {
    const el = document.getElementById(`floor-${floorId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.style.transition = "box-shadow .4s";
    el.style.boxShadow = "0 0 0 3px #d4513b44";
    setTimeout(() => { el.style.boxShadow = ""; }, 1500);
  };

  const handleReply = async () => {
    if (!replyText.trim() || !thread) return;
    setSubmitting(true);
    try {
      let imgIds: number[] = [];
      if (replyImages.length > 0) {
        const results = await Promise.all(replyImages.map((f) => forumApi.uploadImage(f)));
        imgIds = results.map((r) => r.record_id);
      }
      const res = await forumApi.createReply(thread.id, replyText.trim(), replyingTo?.id, imgIds);
      const reply: ReplyItem = res.data;
      setReplyText(""); setReplyImages([]); setReplyingTo(null);
      setThread((prev) => prev ? {
        ...prev,
        reply_count: prev.reply_count + 1,
        replies: [...prev.replies, reply],
      } : prev);
      message.success("回复成功");
    } catch { /* ErrorToast */ }
    finally { setSubmitting(false); }
  };

  const handleEdit = async () => {
    if (!editId) return;
    if (/[<>]/.test(editContent)) return message.warning("不能包含 HTML 标签");
    try {
      await forumApi.updateThread(editId, { content: editContent });
      message.success("已更新"); setEditing(false);
      loadedRef.current = null; load();
    } catch { /* ErrorToast */ }
  };

  const handleDelete = (id: number, isThread: boolean) => {
    Modal.confirm({
      title: "确认删除？", content: "删除后无法恢复",
      onOk: async () => {
        try {
          await forumApi.deleteThread(id);
          message.success("已删除");
          if (isThread) navigate(-1); else { loadedRef.current = null; load(); }
        } catch { /* ErrorToast */ }
      },
      okText: "删除", cancelText: "取消", okButtonProps: { danger: true },
    });
  };

  const handleLike = async (postId: number) => {
    if (!user) { message.info("请先登录"); return; }
    try {
      const res = await forumApi.likePost(postId);
      const { liked, like_count } = res.data;
      setThread((prev) => {
        if (!prev) return prev;
        if (prev.id === postId) {
          return { ...prev, liked, like_count };
        }
        return {
          ...prev,
          replies: prev.replies.map((r) => r.id === postId ? { ...r, liked, like_count } : r),
        };
      });
    } catch { /* ErrorToast */ }
  };

  const handleAdmin = async (action: "pin" | "unpin" | "lock" | "unlock") => {
    if (!thread) return;
    try {
      await forumApi.adminAction(thread.id, action);
      message.success("操作成功");
      loadedRef.current = null; load();
    } catch { /* ErrorToast */ }
  };

  if (loading) return <div className="text-center py-20"><Spin size="large" /></div>;
  if (!thread) return <div className="text-center py-20 text-[#b8afa6]">帖子不存在</div>;

  const canManage = hasPerm("forum:manage");
  const isAuthor = user?.id === thread.author?.id;

  return (
    <div className="max-w-[54rem] mx-auto pt-8">
      {/* Nav */}
      <div className="flex items-center justify-between mb-4">
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)} className="text-[#b8afa6] p-0! font-500">返回</Button>
        <span className="text-[0.75rem] text-[#c4bbb2]">{thread.board_name}</span>
      </div>

      {/* OP */}
      <PostDetail
        thread={thread}
        liked={thread.liked}
        canManage={canManage}
        isAuthor={isAuthor}
        onLike={() => handleLike(thread.id)}
        onEdit={() => { setEditId(thread.id); setEditContent(thread.content); setEditing(true); }}
        onDelete={() => handleDelete(thread.id, true)}
        onAdmin={handleAdmin}
      />

      {/* Replies */}
      <div className="mb-6">
        {thread.replies.length === 0 ? (
          <div className="text-center py-10 rounded-3.5 text-[#b8afa6] text-[0.8125rem] bg-[#faf8f5] border border-solid border-[#f0ede8]">
            <MessageOutlined className="text-6 text-[#d4c8b8] mb-2 block" />
            暂无回复，来说两句吧
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {thread.replies.map((r, idx) => (
              <ReplyCard
                key={r.id}
                reply={r}
                floorNum={idx + 2}
                thread={thread}
                userId={user?.id}
                liked={r.liked}
                canManage={canManage}
                onLike={() => handleLike(r.id)}
                onReply={() => { setReplyingTo({ id: r.id, floor: idx + 2, author: r.author?.username || "匿名" }); setReplyText(""); }}
                onEdit={() => { setEditId(r.id); setEditContent(r.content); setEditing(true); }}
                onDelete={() => handleDelete(r.id, false)}
                onQuoteClick={scrollToFloor}
              />
            ))}
          </div>
        )}
      </div>

      {/* Reply box */}
      <ReplyBox
        locked={thread.is_locked}
        replyingTo={replyingTo}
        submitting={submitting}
        replyText={replyText}
        onReplyTextChange={setReplyText}
        onCancelReply={() => setReplyingTo(null)}
        onSubmit={handleReply}
        images={replyImages}
        onImagesChange={setReplyImages}
      />

      {/* Edit modal */}
      <Modal title="编辑" open={editing} onCancel={() => setEditing(false)} onOk={handleEdit}
        okText="保存" cancelText="取消" width={560}>
        <div className="py-2">
          <Input.TextArea rows={6} value={editContent} onChange={(e) => setEditContent(e.target.value)} className="rounded-2" placeholder="内容" />
        </div>
      </Modal>
    </div>
  );
};

export const page = "ForumThreadPage";
export default ForumThreadPage;
