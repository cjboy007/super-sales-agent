/**
 * 手动创建订单表单组件
 * 
 * 功能:
 * 1. 填写订单基本信息
 * 2. 添加产品清单
 * 3. 自动计算总金额
 * 4. 提交创建订单
 */

import React, { useState, useEffect } from 'react';

interface ProductItem {
  sku?: string;
  name: string;
  quantity: number;
  unit_price: number;
}

interface ShippingAddress {
  country?: string;
  state?: string;
  city?: string;
  address_line1?: string;
  address_line2?: string;
  postal_code?: string;
}

interface OrderCreateFormProps {
  onSuccess?: (orderId: string) => void;
  onCancel?: () => void;
}

const OrderCreateForm: React.FC<OrderCreateFormProps> = ({ onSuccess, onCancel }) => {
  // 表单状态
  const [quotation_no, setQuotationNo] = useState('');
  const [customer_name, setCustomerName] = useState('');
  const [customer_email, setCustomerEmail] = useState('');
  const [customer_company, setCustomerCompany] = useState('');
  const [products, setProducts] = useState<ProductItem[]>([
    { name: '', quantity: 1, unit_price: 0 }
  ]);
  const [currency, setCurrency] = useState('USD');
  const [delivery_date, setDeliveryDate] = useState('');
  const [shipping_address, setShippingAddress] = useState<ShippingAddress>({});
  const [notes, setNotes] = useState('');
  
  // UI 状态
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalAmount, setTotalAmount] = useState(0);
  
  // 计算总金额
  useEffect(() => {
    const total = products.reduce((sum, p) => sum + (p.quantity * p.unit_price), 0);
    setTotalAmount(total);
  }, [products]);
  
  // 添加产品行
  const handleAddProduct = () => {
    setProducts([...products, { name: '', quantity: 1, unit_price: 0 }]);
  };
  
  // 删除产品行
  const handleRemoveProduct = (index: number) => {
    if (products.length === 1) {
      return; // 至少保留一行
    }
    const newProducts = products.filter((_, i) => i !== index);
    setProducts(newProducts);
  };
  
  // 更新产品
  const handleUpdateProduct = (index: number, field: keyof ProductItem, value: any) => {
    const newProducts = [...products];
    newProducts[index] = { ...newProducts[index], [field]: value };
    setProducts(newProducts);
  };
  
  // 更新收货地址
  const handleUpdateAddress = (field: keyof ShippingAddress, value: string) => {
    setShippingAddress({ ...shipping_address, [field]: value });
  };
  
  // 验证表单
  const validateForm = (): boolean => {
    if (!customer_name.trim()) {
      setError('客户名称不能为空');
      return false;
    }
    
    if (!customer_email.trim()) {
      setError('客户邮箱不能为空');
      return false;
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(customer_email)) {
      setError('邮箱格式不正确');
      return false;
    }
    
    if (!delivery_date) {
      setError('请选择交期');
      return false;
    }
    
    // 验证产品清单
    for (let i = 0; i < products.length; i++) {
      const p = products[i];
      if (!p.name.trim()) {
        setError(`第 ${i + 1} 个产品名称不能为空`);
        return false;
      }
      if (p.quantity < 1) {
        setError(`第 ${i + 1} 个产品数量必须大于 0`);
        return false;
      }
      if (p.unit_price < 0) {
        setError(`第 ${i + 1} 个产品单价不能为负数`);
        return false;
      }
    }
    
    return true;
  };
  
  // 提交表单
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    if (!validateForm()) {
      return;
    }
    
    setSubmitting(true);
    
    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          quotation_no: quotation_no || undefined,
          customer_name,
          customer_email,
          customer_company: customer_company || undefined,
          product_list: products,
          currency,
          delivery_date,
          shipping_address: Object.keys(shipping_address).length > 0 ? shipping_address : undefined,
          notes: notes || undefined
        })
      });
      
      const result = await response.json();
      
      if (!response.ok || !result.success) {
        throw new Error(result.message || '创建订单失败');
      }
      
      // 成功
      if (onSuccess) {
        onSuccess(result.data.order_id);
      }
      
      // 重置表单
      setQuotationNo('');
      setCustomerName('');
      setCustomerEmail('');
      setCustomerCompany('');
      setProducts([{ name: '', quantity: 1, unit_price: 0 }]);
      setCurrency('USD');
      setDeliveryDate('');
      setShippingAddress({});
      setNotes('');
      
    } catch (err: any) {
      setError(err.message || '创建订单失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  };
  
  return (
    <form onSubmit={handleSubmit} className="order-create-form">
      <h2>创建订单</h2>
      
      {error && (
        <div className="error-message">
          {error}
        </div>
      )}
      
      {/* 基本信息 */}
      <div className="form-section">
        <h3>基本信息</h3>
        
        <div className="form-row">
          <div className="form-group">
            <label>关联报价单编号</label>
            <input
              type="text"
              value={quotation_no}
              onChange={(e) => setQuotationNo(e.target.value)}
              placeholder="QT-YYYYMMDD-XXX"
            />
          </div>
          
          <div className="form-group">
            <label>客户名称 *</label>
            <input
              type="text"
              value={customer_name}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="请输入客户名称"
              required
            />
          </div>
        </div>
        
        <div className="form-row">
          <div className="form-group">
            <label>客户邮箱 *</label>
            <input
              type="email"
              value={customer_email}
              onChange={(e) => setCustomerEmail(e.target.value)}
              placeholder="customer@example.com"
              required
            />
          </div>
          
          <div className="form-group">
            <label>客户公司</label>
            <input
              type="text"
              value={customer_company}
              onChange={(e) => setCustomerCompany(e.target.value)}
              placeholder="公司名称"
            />
          </div>
        </div>
        
        <div className="form-row">
          <div className="form-group">
            <label>交期 *</label>
            <input
              type="date"
              value={delivery_date}
              onChange={(e) => setDeliveryDate(e.target.value)}
              required
            />
          </div>
          
          <div className="form-group">
            <label>货币</label>
            <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
              <option value="USD">USD - 美元</option>
              <option value="CNY">CNY - 人民币</option>
              <option value="EUR">EUR - 欧元</option>
              <option value="GBP">GBP - 英镑</option>
            </select>
          </div>
        </div>
      </div>
      
      {/* 产品清单 */}
      <div className="form-section">
        <h3>产品清单</h3>
        
        <table className="product-table">
          <thead>
            <tr>
              <th>产品名称</th>
              <th width="100">数量</th>
              <th width="120">单价 ({currency})</th>
              <th width="120">小计</th>
              <th width="50">操作</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product, index) => (
              <tr key={index}>
                <td>
                  <input
                    type="text"
                    value={product.name}
                    onChange={(e) => handleUpdateProduct(index, 'name', e.target.value)}
                    placeholder="产品名称"
                    style={{ width: '100%' }}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    value={product.quantity}
                    onChange={(e) => handleUpdateProduct(index, 'quantity', parseInt(e.target.value) || 0)}
                    min="1"
                    style={{ width: '80px' }}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    value={product.unit_price}
                    onChange={(e) => handleUpdateProduct(index, 'unit_price', parseFloat(e.target.value) || 0)}
                    min="0"
                    step="0.01"
                    style={{ width: '100px' }}
                  />
                </td>
                <td>
                  {(product.quantity * product.unit_price).toFixed(2)}
                </td>
                <td>
                  <button
                    type="button"
                    onClick={() => handleRemoveProduct(index)}
                    disabled={products.length === 1}
                    className="btn-remove"
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        
        <div className="product-table-footer">
          <button type="button" onClick={handleAddProduct} className="btn-add">
            + 添加产品
          </button>
          
          <div className="total-amount">
            <strong>总金额：{currency} {totalAmount.toFixed(2)}</strong>
          </div>
        </div>
      </div>
      
      {/* 收货地址 */}
      <div className="form-section">
        <h3>收货地址</h3>
        
        <div className="form-row">
          <div className="form-group">
            <label>国家/地区</label>
            <input
              type="text"
              value={shipping_address.country || ''}
              onChange={(e) => handleUpdateAddress('country', e.target.value)}
              placeholder="例如：United States"
            />
          </div>
          
          <div className="form-group">
            <label>州/省</label>
            <input
              type="text"
              value={shipping_address.state || ''}
              onChange={(e) => handleUpdateAddress('state', e.target.value)}
              placeholder="例如：California"
            />
          </div>
        </div>
        
        <div className="form-row">
          <div className="form-group">
            <label>城市</label>
            <input
              type="text"
              value={shipping_address.city || ''}
              onChange={(e) => handleUpdateAddress('city', e.target.value)}
              placeholder="例如：Los Angeles"
            />
          </div>
          
          <div className="form-group">
            <label>邮编</label>
            <input
              type="text"
              value={shipping_address.postal_code || ''}
              onChange={(e) => handleUpdateAddress('postal_code', e.target.value)}
              placeholder="例如：90001"
            />
          </div>
        </div>
        
        <div className="form-row">
          <div className="form-group" style={{ flex: 2 }}>
            <label>地址行 1</label>
            <input
              type="text"
              value={shipping_address.address_line1 || ''}
              onChange={(e) => handleUpdateAddress('address_line1', e.target.value)}
              placeholder="街道地址"
            />
          </div>
          
          <div className="form-group" style={{ flex: 2 }}>
            <label>地址行 2</label>
            <input
              type="text"
              value={shipping_address.address_line2 || ''}
              onChange={(e) => handleUpdateAddress('address_line2', e.target.value)}
              placeholder="公寓、套房、单元等（可选）"
            />
          </div>
        </div>
      </div>
      
      {/* 备注 */}
      <div className="form-section">
        <h3>备注</h3>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="特殊要求、包装说明等..."
          rows={4}
          style={{ width: '100%' }}
        />
      </div>
      
      {/* 提交按钮 */}
      <div className="form-actions">
        <button type="submit" disabled={submitting} className="btn-primary">
          {submitting ? '创建中...' : '创建订单'}
        </button>
        
        {onCancel && (
          <button type="button" onClick={onCancel} className="btn-secondary">
            取消
          </button>
        )}
      </div>
    </form>
  );
};

export default OrderCreateForm;
