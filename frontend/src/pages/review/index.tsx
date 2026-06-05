import { useState, useEffect, useCallback, type FC } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, Spin, Empty, Modal, Input, Pagination, Tag, message } from "antd";
import {
  EyeOutlined,
  CheckOutlined,
  CloseOutlined,
  FileTextOutlined,
  MessageOutlined,
  ToolOutlined,
  SafetyOutlined,
} from "@ant-design/icons";
import { reviewApi } from "@/api/review";
import type { PendingReview } from "@/api/review";

const { TextArea } = Input;

const CONTENT_TYPE_META: Record<string, { label: string; color: string; icon: FC<{ className?: string }> }> = {
  thread: { label: "帖子", color: "#1677ff", icon: FileTextOutlined },
  reply: { label: "回复", color: "#52c41a", icon: MessageOutlined },
  task: { label: "任务", color: "#faad14", icon: ToolOutlined },
};

function getContentUrl(item: PendingReview): string {
  switch (item.content_type) {
    case "thread":
    case "reply":
      return `/forum/post/${item.content_id}`;
    case "task":
      return `/market/${item.content_id}`;
    default:
      return "#";
  }
}

function getContentMeta(contentType: string) {
  return (
    CONTENT_TYPE_META[contentType] ?? {
      label: contentType,
      color: "#8c8c8c",
      icon: FileTextOutlined,
    }
  );
}

const ReviewPage: FC = () => {
  // ── 状态 ──
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<PendingReview[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const [approveTarget, setApproveTarget] = useState<PendingReview | null>(null);
  const [approveLoading, setApproveLoading] = useState(false);

  const [rejectTarget, setRejectTarget] = useState<PendingReview | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectLoading, setRejectLoading] = useState(false);

  const navigate = useNavigate();

  // ── 数据获取 ──
  const load = useCallback((p = page) => {
    setLoading(true);
    reviewApi
      .pending(p, pageSize)
      .then((res) => {
        setItems(res.items);
        setTotal(res.total);
      })
      .catch(() => {
        /* ErrorToast 已处理 */
      })
      .finally(() => setLoading(false));
  }, [pageSize]);

  useEffect(() => {
    load(1);
  }, []);

  const handlePageChange = (p: number) => {
    setPage(p);
    load(p);
  };

  // ── 审核操作 ──
  const confirmApprove = async () => {
    if (!approveTarget) return;
    setApproveLoading(true);
    try {
      await reviewApi.decide(approveTarget.id, "approved");
      message.success("已通过审核");
      setApproveTarget(null);
      load();
    } catch {
      /* ErrorToast 已处理 */
    } finally {
      setApproveLoading(false);
    }
  };

  const confirmReject = async () => {
    if (!rejectTarget) return;
    if (!rejectReason.trim()) {
      message.warning("请输入拒绝原因");
      return;
    }
    setRejectLoading(true);
    try {
      await reviewApi.decide(rejectTarget.id, "rejected", rejectReason.trim());
      message.success("已拒绝");
      setRejectTarget(null);
      setRejectReason("");
      load();
    } catch {
      /* ErrorToast 已处理 */
    } finally {
      setRejectLoading(false);
    }
  };

  // ── 渲染顺序: loading → empty → normal ──
  if (loading) {
    return (
      <div className="w-full px-6 max-w-[1600px] mx-auto pt-8">
        <Spin spinning>
          <div className="min-h-60" />
        </Spin>
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="w-full px-6 max-w-[1600px] mx-auto pt-8">
        <div className="flex items-center gap-2 mb-6">
          <SafetyOutlined className="text-[#d4513b] text-2xl" />
          <h2 className="text-[1.125rem] font-600 text-[#1a1a1a] m-0">审核中心</h2>
        </div>
        <Empty description="暂无待审核内容" />
      </div>
    );
  }

  return (
    <div className="w-full px-6 max-w-[1600px] mx-auto pt-8">
      {/* 页头 */}
      <div className="flex items-center gap-2 mb-6">
        <SafetyOutlined className="text-[#d4513b] text-2xl" />
        <h2 className="text-[1.125rem] font-600 text-[#1a1a1a] m-0">审核中心</h2>
        <span className="text-[0.8125rem] text-[#8c8c8c] ml-2">
          共 {total} 条待审核
        </span>
      </div>

      {/* 列表 */}
      <div className="flex flex-col gap-3">
        {items.map((item) => {
          const meta = getContentMeta(item.content_type);
          const IconComp = meta.icon;
          return (
            <Card
              key={item.id}
              className="bg-white rounded-3 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
            >
              <div className="flex items-start justify-between gap-4">
                {/* 左侧内容 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <Tag
                      color={meta.color}
                      className="text-[0.6875rem] m-0! border-0! rounded-1.5"
                    >
                      <span className="flex items-center gap-1">
                        <IconComp className="text-[0.75em]" />
                        {meta.label}
                      </span>
                    </Tag>
                    <span className="text-[0.8125rem] font-500 text-[#1a1a1a] truncate">
                      {item.title}
                    </span>
                  </div>

                  {item.reason && (
                    <div className="text-[0.75rem] text-[#8c8c8c] mb-2 leading-relaxed">
                      <span className="text-[#d4513b] font-500 mr-1">AI 分析：</span>
                      {item.reason}
                    </div>
                  )}

                  <div className="text-[0.6875rem] text-[#8c8c8c]">
                    {new Date(item.created_at).toLocaleString("zh-CN")}
                  </div>
                </div>

                {/* 右侧操作 */}
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    type="text"
                    size="small"
                    icon={<EyeOutlined />}
                    className="text-[#8c8c8c] hover:text-[#d4513b]"
                    onClick={() => navigate(getContentUrl(item))}
                  >
                    查看
                  </Button>
                  <Button
                    type="text"
                    size="small"
                    icon={<CheckOutlined />}
                    className="text-[#52c41a] hover:text-white! hover:bg-[#52c41a]!"
                    onClick={() => setApproveTarget(item)}
                  >
                    通过
                  </Button>
                  <Button
                    type="text"
                    size="small"
                    icon={<CloseOutlined />}
                    className="text-[#ff4d4f] hover:text-white! hover:bg-[#ff4d4f]!"
                    onClick={() => {
                      setRejectTarget(item);
                      setRejectReason("");
                    }}
                  >
                    拒绝
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* 分页 */}
      {total > pageSize && (
        <div className="flex justify-center mt-6">
          <Pagination
            current={page}
            total={total}
            pageSize={pageSize}
            onChange={handlePageChange}
            showTotal={(t: number) => `共 ${t} 条`}
          />
        </div>
      )}

      {/* 通过确认弹窗 */}
      <Modal
        title="确认审核通过"
        open={!!approveTarget}
        onCancel={() => setApproveTarget(null)}
        onOk={confirmApprove}
        confirmLoading={approveLoading}
        okText="确认通过"
        cancelText="取消"
        width={420}
      >
        <div className="py-2">
          <p className="text-[0.875rem] text-[#1a1a1a] m-0">
            确认通过以下内容的审核？
          </p>
          <p className="text-[0.8125rem] text-[#8c8c8c] mt-2 mb-0">
            {approveTarget?.title}
          </p>
        </div>
      </Modal>

      {/* 拒绝弹窗 */}
      <Modal
        title="拒绝审核"
        open={!!rejectTarget}
        onCancel={() => {
          setRejectTarget(null);
          setRejectReason("");
        }}
        onOk={confirmReject}
        confirmLoading={rejectLoading}
        okText="确认拒绝"
        cancelText="取消"
        okButtonProps={{ danger: true }}
        width={480}
      >
        <div className="py-2">
          <p className="text-[0.875rem] text-[#1a1a1a] mb-3">
            确认拒绝以下内容？
          </p>
          <p className="text-[0.8125rem] text-[#8c8c8c] mb-4">
            {rejectTarget?.title}
          </p>
          <TextArea
            placeholder="请输入拒绝原因（必填）"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={3}
            maxLength={500}
            showCount
          />
        </div>
      </Modal>
    </div>
  );
};

export const page = "ReviewPage";
export default ReviewPage;
