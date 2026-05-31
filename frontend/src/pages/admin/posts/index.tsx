import { useEffect, useState, type FC } from "react";
import { Table, Button, Tag, Modal, Descriptions, Select, Space, Tabs, message } from "antd";
import { EyeOutlined } from "@ant-design/icons";
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

  const load = () => {
    setLoading(true);
    adminApi.listPosts(type, filter === "unreviewed" ? false : undefined)
      .then(setPosts).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [filter, type]);

  const review = async (id: number, status: string) => {
    try {
      await adminApi.reviewPost(id, { status, reviewed: true });
      message.success(status === "rejected" ? "已拒绝" : "已恢复");
      load();
    } catch { /* ErrorToast */ }
  };

  return (
    <div className="pt-8 w-[min(94%,70rem)] mx-auto">
      <h2 className="text-[1.125rem] font-600 text-[#3d3630] mb-2">帖子审核</h2>
      <Tabs activeKey={filter} onChange={(k) => setFilter(k as any)} className="mb-1"
        items={[{ key: "unreviewed", label: "未审核" }, { key: "all", label: "全部" }]}
        tabBarExtraContent={
          <Tabs activeKey={type} onChange={(k) => setType(k as any)}
            items={[{ key: "threads", label: "帖子" }, { key: "replies", label: "评论" }]} />
        } />
      <Table dataSource={posts} rowKey="id" loading={loading}
        pagination={{ pageSize: 20 }} className="bg-white rounded-3"
        columns={[
          { title: "标题", dataIndex: "title", ellipsis: true, render: (v: string) => v || "—" },
          { title: "作者", dataIndex: "author_name", width: 80 },
          { title: "状态", dataIndex: "status", width: 70,
            render: (s: string) => <Tag color={STATUS_MAP[s]?.color}>{STATUS_MAP[s]?.label}</Tag> },
          { title: "操作", width: 180,
            render: (_: unknown, record: AdminPost) => (
              <Space size={4}>
                <Button size="small" type="text" icon={<EyeOutlined />} onClick={() => setDetail(record)} />
                <Select size="small" value={record.status === "rejected" ? "rejected" : "approved"}
                  onChange={(v) => review(record.id, v)}
                  options={[{ value: "approved", label: "通过" }, { value: "rejected", label: "拒绝" }]} />
              </Space>
            ),
          },
        ]} />
      <Modal title={detail?.title || "详情"} open={!!detail} onCancel={() => setDetail(null)} footer={null} width={640}>
        {detail && (
          <Descriptions column={1} size="small">
            <Descriptions.Item label="作者">{detail.author_name}</Descriptions.Item>
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
