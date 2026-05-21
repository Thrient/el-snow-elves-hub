import { useEffect, useState, type FC } from "react";
import { Table, Button, Select, message, Popconfirm, Tag, Modal, Descriptions, Space } from "antd";
import { DeleteOutlined, EyeOutlined } from "@ant-design/icons";
import { useAuthStore } from "../../store/auth";
import axios from "axios";

const API = axios.create({ baseURL: "/api/v1" });
API.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

interface AdminTask {
  id: number;
  title: string;
  author_id: number;
  category: string;
  version: string;
  status: string;
  download_count: number;
  like_count: number;
  file_size: number | null;
  created_at: string;
}

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

  const load = () =>
    API.get("/admin/tasks").then((r) => setTasks(r.data));

  useEffect(() => { load(); }, []);

  const changeStatus = async (id: number, status: string) => {
    setLoading(true);
    try { await API.put(`/admin/tasks/${id}/status`, { status }); message.success("状态已更新"); load(); }
    catch { message.error("操作失败"); }
    finally { setLoading(false); }
  };

  const remove = async (id: number) => {
    try { await API.delete(`/admin/tasks/${id}`); message.success("已删除"); load(); }
    catch { message.error("删除失败"); }
  };

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 600, color: "#3d3630", margin: "0 0 24px" }}>任务管理</h2>
      <Table
        dataSource={tasks}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 20 }}
        scroll={{ y: "calc(100vh - 330px)" }}
        style={{ background: "#fff", borderRadius: 12 }}
        columns={[
          { title: "ID", dataIndex: "id", width: 50 },
          { title: "标题", dataIndex: "title", ellipsis: true },
          { title: "分类", dataIndex: "category", width: 80 },
          { title: "版本", dataIndex: "version", width: 80 },
          {
            title: "状态", dataIndex: "status", width: 100,
            render: (s: string) => {
              const st = STATUS_MAP[s] || { color: "default", label: s };
              return <Tag color={st.color}>{st.label}</Tag>;
            },
          },
          { title: "下载", dataIndex: "download_count", width: 60 },
          { title: "点赞", dataIndex: "like_count", width: 60 },
          {
            title: "操作", width: canDelete ? 220 : 130,
            render: (_: unknown, record: AdminTask) => (
              <Space size={4}>
                {canApprove && (
                  <Select
                    size="small"
                    value={record.status}
                    style={{ width: 90 }}
                    onChange={(v) => changeStatus(record.id, v)}
                    options={[
                      { value: "approved", label: "已上架" },
                      { value: "pending", label: "待审核" },
                      { value: "rejected", label: "已驳回" },
                    ]}
                  />
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

      <Modal title="任务详情" open={!!detail} onCancel={() => setDetail(null)} footer={null}>
        {detail && (
          <Descriptions column={1} size="small">
            <Descriptions.Item label="ID">{detail.id}</Descriptions.Item>
            <Descriptions.Item label="标题">{detail.title}</Descriptions.Item>
            <Descriptions.Item label="分类">{detail.category}</Descriptions.Item>
            <Descriptions.Item label="版本">{detail.version}</Descriptions.Item>
            <Descriptions.Item label="状态">
              <Tag color={STATUS_MAP[detail.status]?.color}>{STATUS_MAP[detail.status]?.label}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="下载">{detail.download_count}</Descriptions.Item>
            <Descriptions.Item label="点赞">{detail.like_count}</Descriptions.Item>
            <Descriptions.Item label="大小">{detail.file_size ? `${(detail.file_size / 1024).toFixed(1)} KB` : "—"}</Descriptions.Item>
            <Descriptions.Item label="创建时间">{new Date(detail.created_at).toLocaleString("zh-CN")}</Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </div>
  );
};

export default TasksPage;
