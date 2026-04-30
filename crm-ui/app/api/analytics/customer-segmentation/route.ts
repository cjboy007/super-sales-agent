import { NextResponse } from 'next/server';
import { getCustomerSegmentation } from '../../../../lib/analytics/order-data-service';

export async function GET() {
  try {
    return NextResponse.json({
      success: true,
      data: getCustomerSegmentation(),
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: 'INTERNAL_ERROR',
        message: error?.message || '获取客户分层失败',
      },
      { status: 500 }
    );
  }
}
