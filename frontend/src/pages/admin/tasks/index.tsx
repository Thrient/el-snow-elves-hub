import { useEffect, useState, type FC } from "react";
import { Table, Button, Select, message, Popconfirm, Tag, Modal, Descriptions, Space, Tabs } from "antd";
import { DeleteOutlined, EyeOutlined } from "@ant-design/icons";
import { useAuthStore } from "@/store/auth";
import { adminApi } from "@/api/admin";
import type { AdminTask } from "@/types";

const STATUS_MAP: Record<string, { color: string; label: string }> = {
  approved: { color: "green", label: "已上架" },
  pending: { color: "orange", label: "待审核" },
  rejected: { color: "red", label: "已驳回" },
};

const TasksPage: FC = () => {
  const [tasks, setTasks] = useState<AdminTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<AdminTask | null>(null);
  const hasPerm = useAuthStore((s) => s.hasPerm);
  const canApprove = hasPerm("task:approve");
  const canDelete = hasPerm("task:delete");
  const [filter, setFilter] = useState<"unreviewed" | "all">("unreviewed");

  const load = () => adminApi.listTasks().then(setTasks);
  useEffect(() => { void load(); }, []);

  const changeStatus = async (id: number, status: string) => {
    setLoading(true);
    try { await adminApi.updateTaskStatus(id, status); message.success("状态已更新"); void load(); }
    catch { /* ErrorToast */ }
    finally { setLoading(false); }
  };

  const remove = async (id: number) => {
    try { await adminApi.deleteTask(id); message.success("已删除"); void load(); }
    catch { /* ErrorToast */ }
  };

  return (
    <div className="pt-8 w-[min(94%,70rem)] mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-[1.125rem] font-600 text-[#3d3630] m-0">任务管理</h2>
      </div>
      <Tabs activeKey={filter} onChange={(k) => setFilter(k as any)} className="mb-4"
        items={[{ key: "unreviewed", label: "未审核" }, { key: "all", label: "全部" }]} />
      <Table dataSource={filter === "unreviewed" ? tasks.filter((t) => !t.reviewed) : tasks} rowKey="id" loading={loading}
        pagination={{ pageSize: 20 }} className="bg-white rounded-3" scroll={{ y: "calc(100vh - 330px)" }}
        columns={[
          { title: "ID", dataIndex: "id", width: 50 },
          { title: "标题", dataIndex: "title", ellipsis: true },
          { title: "分类", dataIndex: "category", width: 80 },
          { title: "版本", dataIndex: "version", width: 80 },
          { title: "状态", dataIndex: "status", width: 100,
            render: (s: string) => { const st = STATUS_MAP[s] || { color: "default", label: s }; return <Tag color={st.color}>{st.label}</Tag>; },
          },
          { title: "下载", dataIndex: "download_count", width: 60 },
          { title: "点赞", dataIndex: "like_count", width: 60 },
          { title: "操作", width: canDelete ? 220 : 130,
            render: (_: unknown, record: AdminTask) => (
              <Space size={4}>
                {canApprove && (
                  <Select size="small" value={record.status} className="w-22.5"
                    onChange={(v) => changeStatus(record.id, v)}
                    options={[{ value: "approved", label: "已上架" }, { value: "pending", label: "待审核" }, { value: "rejected", label: "已驳回" }]} />
                )}
                <Button size="small" type="text" icon={<EyeOutlined />} onClick={() => setDetail(record)} />
                {canDelete && (
                  <Popconfirm title="确认删除此任务？" onConfirm={() => remove(record.id)}>
                    <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                )}
              </Space>
            ),
          },
        ]}
      />

      <Modal title={detail?.title || "任务详情"} open={!!detail} onCancel={() => setDetail(null)} footer={null} width={640}>
        {detail && (
          <Descriptions column={1} size="small" labelStyle={{ width: 60 }}>
            <Descriptions.Item label="作者">{detail.author_name || `#${detail.author_id}`}</Descriptions.Item>
            <Descriptions.Item label="分类">{detail.category}</Descriptions.Item>
            <Descriptions.Item label="版本">{detail.version}</Descriptions.Item>
            <Descriptions.Item label="状态"><Tag color={STATUS_MAP[detail.status]?.color}>{STATUS_MAP[detail.status]?.label}</Tag></Descriptions.Item>
            <Descriptions.Item label="标签">{detail.tags || "—"}</Descriptions.Item>
            <Descriptions.Item label="文件">{detail.file_size ? `${(detail.file_size / 1024).toFixed(1)} KB` : "—"}</Descriptions.Item>
            <Descriptions.Item label="下载">{detail.download_count}</Descriptions.Item>
            <Descriptions.Item label="点赞">{detail.like_count}</Descriptions.Item>
            <Descriptions.Item label="描述" contentStyle={{ whiteSpace: "pre-wrap" }}>{detail.description || "—"}</Descriptions.Item>
            {detail.cover_url && <Descriptions.Item label="封面"><img src={detail.cover_url} alt="" className="max-w-full max-h-60 rounded-2" /></Descriptions.Item>}
            <Descriptions.Item label="时间">{new Date(detail.created_at).toLocaleString("zh-CN")}</Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </div>
  );
};

export const page = "TasksPage";
export default TasksPage;
