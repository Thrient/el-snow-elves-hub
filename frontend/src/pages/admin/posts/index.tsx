import { useEffect, useState, type FC } from "react";
import { Table, Button, Tag, Modal, Descriptions, Select, Space, Tabs, Popconfirm, message, Input } from "antd";
import { EyeOutlined, DeleteOutlined } from "@ant-design/icons";
import { adminApi } from "@/api/admin";
import type { AdminPost } from "@/types";

const STATUS_MAP: Record<string, { color: string; label: string }> = {
  approved: { color: "green", label: "已上架" },
  rejected: { color: "red", label: "已拒绝" },
};

const AdminPostsPage: FC = () => {
  const [posts, setPosts] = useState<AdminPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<AdminPost | null>(null);
  const [filter, setFilter] = useState<"unreviewed" | "all">("unreviewed");
  const [type, setType] = useState<"threads" | "replies">("threads");
  const [rejectTarget, setRejectTarget] = useState<{ open: boolean; id: number; reason: string }>({
    open: false, id: 0, reason: "",
  });

  const load = () => {
    setLoading(true);
    adminApi.listPosts(type, filter === "unreviewed" ? false : undefined)
      .then(setPosts).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [filter, type]);

  const review = async (id: number, status: string, reason?: string) => {
    try {
      await adminApi.reviewPost(id, { status, reviewed: true, reason });
      message.success(status === "rejected" ? "已拒绝" : "已审核");
      load();
    } catch { /* ErrorToast */ }
  };

  const remove = async (id: number) => {
    try { await adminApi.deletePost(id); message.success("已删除"); load(); }
    catch { /* ErrorToast */ }
  };

  return (
    <div className="pt-8 w-[min(94%,70rem)] mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-[1.125rem] font-600 text-[#3d3630] m-0">帖子审核</h2>
      </div>
      <Tabs activeKey={`${filter}/${type}`} onChange={(k) => {
        const [f, t] = k.split("/");
        setFilter(f as any); setType(t as any);
      }} className="mb-4"
        items={[
          { key: "unreviewed/threads", label: "未审核帖子" },
          { key: "unreviewed/replies", label: "未审核评论" },
          { key: "all/threads", label: "全部帖子" },
          { key: "all/replies", label: "全部评论" },
        ]} />
      <Table dataSource={posts} rowKey="id" loading={loading}
        pagination={{ pageSize: 20 }} className="bg-white rounded-3"
        columns={[
          { title: type === "threads" ? "标题" : "评论", dataIndex: type === "threads" ? "title" : "content",
            ellipsis: true, width: type === "threads" ? undefined : 300,
            render: (v: string) => v || "—" },
          ...(type === "threads" ? [{ title: "内容", dataIndex: "content", ellipsis: true, width: 250,
            render: (v: string) => v ? (v.length > 60 ? v.slice(0, 60) + "…" : v) : "—" }] : []),
          { title: "用户", dataIndex: "author_name", width: 80 },
          { title: "状态", dataIndex: "status", width: 70,
            render: (s: string) => <Tag color={STATUS_MAP[s]?.color}>{STATUS_MAP[s]?.label}</Tag> },
          { title: "操作", width: 240,
            render: (_: unknown, record: AdminPost) => (
              <Space size={4}>
                <Button size="small" type="text" icon={<EyeOutlined />} onClick={() => setDetail(record)} />
                {record.reviewed ? (
                  <>
                    <Select size="small" value={record.status}
                      onChange={(v) => review(record.id, v)}
                      options={[{ value: "approved", label: "通过" }, { value: "rejected", label: "拒绝" }]} />
                    <Popconfirm title="确定删除?" onConfirm={() => remove(record.id)}>
                      <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                  </>
                ) : (
                  <>
                    <Button size="small" type="primary" onClick={() => review(record.id, "approved")}>通过</Button>
                    <Button size="small" danger onClick={() => setRejectTarget({ open: true, id: record.id, reason: "" })}>拒绝</Button>
                    <Popconfirm title="确定删除?" onConfirm={() => remove(record.id)}>
                      <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                  </>
                )}
              </Space>
            ),
          },
        ]} />
      <Modal
        title="拒绝原因"
        open={rejectTarget.open}
        onOk={async () => {
          await review(rejectTarget.id, "rejected", rejectTarget.reason);
          setRejectTarget({ open: false, id: 0, reason: "" });
        }}
        onCancel={() => setRejectTarget({ open: false, id: 0, reason: "" })}
        okText="确认拒绝"
        okButtonProps={{ danger: true }}
      >
        <Input.TextArea
          placeholder="请输入拒绝原因（将通知用户）"
          value={rejectTarget.reason}
          onChange={(e) => setRejectTarget(prev => ({ ...prev, reason: e.target.value }))}
          rows={3}
        />
      </Modal>
      <Modal title={detail?.title || "详情"} open={!!detail} onCancel={() => setDetail(null)} footer={null} width={640}>
        {detail && (
          <Descriptions column={1} size="small">
            <Descriptions.Item label="用户">{detail.author_name}</Descriptions.Item>
            <Descriptions.Item label="状态"><Tag color={STATUS_MAP[detail.status]?.color}>{STATUS_MAP[detail.status]?.label}</Tag></Descriptions.Item>
            <Descriptions.Item label="内容" contentStyle={{ whiteSpace: "pre-wrap" }}>{detail.content}</Descriptions.Item>
            {detail.image_urls?.length > 0 && (
              <Descriptions.Item label="图片">
                <div className="flex flex-col gap-2">
                  {detail.image_urls.map((url: string, i: number) => <img key={i} src={url} className="max-w-full max-h-60 rounded-2" />)}
                </div>
              </Descriptions.Item>
            )}
            <Descriptions.Item label="时间">{new Date(detail.created_at).toLocaleString("zh-CN")}</Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </div>
  );
};

export const page = "AdminPostsPage";
export default AdminPostsPage;
