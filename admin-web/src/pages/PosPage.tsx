import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useAuth } from '../auth/AuthProvider';
import { CustomerNameAutocomplete } from '../components/CustomerNameAutocomplete';
import { BoxIcon, DropIcon, IceIcon } from '../components/UiIcons';
import { money, publicWrsAssetUrl } from '../lib/format';
import { recordContainerLend, resolveProfileUserIdForPosName } from '../lib/containerLend';
import { customerNameKey, loadPosCustomerNames, savePosWalkInCustomer, type PosCustomerOption } from '../lib/posCustomerNames';
import { isLowStock, stockLabel, tracksStock, type CatalogCategory } from '../lib/inventoryStock';
import { awardPosSaleLoyalty } from '../lib/loyaltyProgram';
import { type PosPaymentMethod } from '../lib/posPayment';
import { supabase } from '../lib/supabase';

type ProductRow = {
  id: string;
  name: string;
  price: number;
  is_available: boolean;
  category: CatalogCategory;
  stock_quantity: number | null;
  image_url?: string | null;
  earn_loyalty_points?: boolean;
};

type CartLine = {
  productId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  image_url?: string | null;
};

type PosCategory = 'all' | CatalogCategory;

function productMatchesCategory(p: ProductRow, cat: PosCategory): boolean {
  if (cat === 'all') return true;
  return p.category === cat;
}

const POS_CATEGORIES: { id: PosCategory; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'water', label: 'Water' },
  { id: 'bottled_water', label: 'Bottled Water' },
  { id: 'ice', label: 'Ice' },
];

function categoryLabel(category: ProductRow['category']) {
  if (category === 'ice') return 'Ice';
  if (category === 'bottled_water') return 'Bottled Water';
  if (category === 'water') return 'Water';
  return 'Other';
}

type PosDraft = {
  cart: CartLine[];
  customerName: string;
  paymentMethod: PosPaymentMethod;
  cashReceived: string;
  borrowOpen: boolean;
  borrowDraft: string;
  addLoyalty: boolean;
};

function posDraftKey(businessId: string) {
  return `watermarket-pos-draft:${businessId}`;
}

function readPosDraft(businessId: string): PosDraft | null {
  try {
    const raw = sessionStorage.getItem(posDraftKey(businessId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PosDraft;
    if (!parsed || !Array.isArray(parsed.cart)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writePosDraft(businessId: string, draft: PosDraft) {
  const empty =
    draft.cart.length === 0 &&
    !draft.customerName.trim() &&
    !draft.cashReceived.trim() &&
    !draft.borrowOpen &&
    !draft.borrowDraft.trim() &&
    !draft.addLoyalty;
  if (empty) {
    sessionStorage.removeItem(posDraftKey(businessId));
    return;
  }
  sessionStorage.setItem(posDraftKey(businessId), JSON.stringify(draft));
}

const POS_PAYMENT_METHODS: { id: PosPaymentMethod; label: string; icon: 'cash' | 'gcash' }[] = [
  { id: 'cash', label: 'Cash', icon: 'cash' },
  { id: 'gcash', label: 'GCash', icon: 'gcash' },
];

export function PosPage() {
  const { businessId } = useAuth();
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitKind, setSubmitKind] = useState<'paid' | 'unpaid' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<PosCategory>('all');
  const [customerName, setCustomerName] = useState('');
  const [customerNameOptions, setCustomerNameOptions] = useState<PosCustomerOption[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PosPaymentMethod>('cash');
  const [cashReceived, setCashReceived] = useState('');
  const [borrowOpen, setBorrowOpen] = useState(false);
  const [borrowCode, setBorrowCode] = useState('');
  const [borrowSaving, setBorrowSaving] = useState(false);
  const [borrowedAdded, setBorrowedAdded] = useState<string[]>([]);
  const [addLoyalty, setAddLoyalty] = useState(false);
  const [addedNote, setAddedNote] = useState<string | null>(null);
  const [addedFlashId, setAddedFlashId] = useState<string | null>(null);
  const lastSavedCustomerKey = useRef('');
  const addedNoteTimer = useRef<number | null>(null);
  const skipDraftSave = useRef(true);
  const cartRef = useRef<HTMLElement | null>(null);

  const loadProducts = useCallback(async () => {
    if (!businessId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error: err } = await supabase
      .from('products')
      .select('id,name,price,is_available,category,stock_quantity,image_url,earn_loyalty_points')
      .eq('seller_id', businessId)
      .eq('is_available', true)
      .order('sort_order', { ascending: true });
    if (err) setError(err.message);
    setProducts((data ?? []) as ProductRow[]);
    setLoading(false);
  }, [businessId]);

  const loadCustomerNames = useCallback(async () => {
    if (!businessId) return;
    const names = await loadPosCustomerNames(businessId);
    setCustomerNameOptions(names);
  }, [businessId]);

  useEffect(() => {
    if (!businessId) return;
    const draft = readPosDraft(businessId);
    if (draft) {
      setCart(draft.cart);
      setCustomerName(draft.customerName ?? '');
      setPaymentMethod(draft.paymentMethod === 'gcash' ? 'gcash' : 'cash');
      setCashReceived(draft.cashReceived ?? '');
      setBorrowOpen(Boolean(draft.borrowOpen));
      setBorrowCode(draft.borrowDraft ?? '');
      setAddLoyalty(Boolean(draft.addLoyalty));
    }
    skipDraftSave.current = true;
  }, [businessId]);

  useEffect(() => {
    if (!businessId) return;
    if (skipDraftSave.current) {
      skipDraftSave.current = false;
      return;
    }
    writePosDraft(businessId, {
      cart,
      customerName,
      paymentMethod,
      cashReceived,
      borrowOpen,
      borrowDraft: borrowCode,
      addLoyalty,
    });
  }, [businessId, cart, customerName, paymentMethod, cashReceived, borrowOpen, borrowCode, addLoyalty]);

  useEffect(() => {
    void loadProducts();
    void loadCustomerNames();
    if (!businessId) return;
    const ch = supabase
      .channel(`admin-pos-products-${businessId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'products', filter: `seller_id=eq.${businessId}` },
        () => void loadProducts()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [businessId, loadProducts, loadCustomerNames]);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (tracksStock(p.category) && p.stock_quantity != null && p.stock_quantity <= 0) return false;
      if (!productMatchesCategory(p, category)) return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q);
    });
  }, [products, search, category]);

  function remainingStock(productId: string): number | null {
    const p = products.find((x) => x.id === productId);
    if (!p || !tracksStock(p.category) || p.stock_quantity == null) return null;
    const inCart = cart.find((c) => c.productId === productId)?.quantity ?? 0;
    return p.stock_quantity - inCart;
  }

  const cartCount = useMemo(() => cart.reduce((s, l) => s + l.quantity, 0), [cart]);
  const cartTotal = useMemo(() => cart.reduce((s, l) => s + l.unitPrice * l.quantity, 0), [cart]);
  const loyaltyPoints = useMemo(
    () =>
      cart.reduce((sum, line) => {
        const product = products.find((item) => item.id === line.productId);
        return sum + (product?.earn_loyalty_points ? line.quantity : 0);
      }, 0),
    [cart, products]
  );
  const cashNum = Number(cashReceived);
  const change = Number.isFinite(cashNum) && cashNum >= cartTotal ? cashNum - cartTotal : 0;

  useEffect(() => {
    return () => {
      if (addedNoteTimer.current != null) window.clearTimeout(addedNoteTimer.current);
    };
  }, []);

  function addProduct(p: ProductRow) {
    const left = remainingStock(p.id);
    if (left != null && left < 1) {
      setError(`Not enough stock for ${p.name}.`);
      return;
    }
    setError(null);
    setAddedNote(`${p.name} added to the order.`);
    setAddedFlashId(p.id);
    if (addedNoteTimer.current != null) window.clearTimeout(addedNoteTimer.current);
    addedNoteTimer.current = window.setTimeout(() => {
      setAddedNote(null);
      setAddedFlashId(null);
    }, 2200);
    setCart((prev) => {
      const idx = prev.findIndex((c) => c.productId === p.id);
      if (idx === -1) {
        return [
          ...prev,
          {
            productId: p.id,
            name: p.name,
            unitPrice: Number(p.price),
            quantity: 1,
            image_url: p.image_url,
          },
        ];
      }
      const next = [...prev];
      next[idx] = { ...next[idx]!, quantity: next[idx]!.quantity + 1 };
      return next;
    });
    setSuccess(null);
  }

  function setLineQty(productId: string, quantity: number) {
    if (quantity < 1) {
      setCart((prev) => prev.filter((l) => l.productId !== productId));
      return;
    }
    const p = products.find((x) => x.id === productId);
    if (p && tracksStock(p.category) && p.stock_quantity != null && quantity > p.stock_quantity) {
      setError(`Only ${p.stock_quantity} in stock for ${p.name}.`);
      quantity = p.stock_quantity;
    } else {
      setError(null);
    }
    setCart((prev) => prev.map((l) => (l.productId === productId ? { ...l, quantity } : l)));
  }

  function removeLine(productId: string) {
    setCart((prev) => prev.filter((l) => l.productId !== productId));
  }

  function clearCart() {
    setCart([]);
    setCashReceived('');
    setCustomerName('');
    lastSavedCustomerKey.current = '';
    setPaymentMethod('cash');
    setBorrowOpen(false);
    setBorrowCode('');
    setBorrowedAdded([]);
    setAddLoyalty(false);
    setSuccess(null);
  }

  async function rememberCustomerName(rawName: string) {
    if (!businessId) return;
    const displayName = rawName.trim().replace(/\s+/g, ' ');
    const key = customerNameKey(displayName);
    if (key.length < 2 || lastSavedCustomerKey.current === key) return;
    const alreadyListed = customerNameOptions.some((option) => customerNameKey(option.name) === key);
    const saved = await savePosWalkInCustomer(businessId, displayName);
    if (!saved.ok) {
      setError(saved.message ?? 'Could not add this customer.');
      return;
    }
    lastSavedCustomerKey.current = key;
    if (alreadyListed) return;
    setError(null);
    setSuccess(`${displayName} was added to the customer list.`);
    await loadCustomerNames();
  }

  async function addBorrowedContainer() {
    if (!businessId || borrowSaving) return;
    const displayName = customerName.trim().replace(/\s+/g, ' ');
    const code = borrowCode.trim().replace(/\s+/g, ' ');
    if (!displayName) {
      setError('Enter the customer name before adding a borrowed container.');
      return;
    }
    if (!code) {
      setError('Enter a container code or description.');
      return;
    }
    setBorrowSaving(true);
    setError(null);
    try {
      const saved = await savePosWalkInCustomer(businessId, displayName);
      if (!saved.ok) {
        setError(saved.message ?? 'Could not save this customer.');
        return;
      }
      lastSavedCustomerKey.current = customerNameKey(displayName);
      const profileUserId = resolveProfileUserIdForPosName(displayName, customerNameOptions);
      const lendRes = await recordContainerLend(supabase, {
        customerName: displayName,
        profileUserId,
        quantity: 1,
        containerNumbers: code,
      });
      if (!lendRes.ok) {
        setError(lendRes.message);
        return;
      }
      setBorrowedAdded((prev) => [...prev, code]);
      setBorrowCode('');
      setSuccess(`${code} recorded as borrowed for ${displayName}.`);
      await loadCustomerNames();
    } finally {
      setBorrowSaving(false);
    }
  }

  async function submitSale(paymentSettled: boolean) {
    if (!businessId || cart.length === 0) return;

    if (!paymentSettled && !customerName.trim()) {
      setError('Customer name is required for unpaid orders.');
      return;
    }

    if (addLoyalty && !customerName.trim()) {
      setError('Enter the customer name so the loyalty points can be saved.');
      return;
    }

    if (paymentSettled) {
      if (!Number.isFinite(cashNum) || cashNum < cartTotal) {
        setError('Enter cash received (at least the order total) for a paid sale.');
        return;
      }
    }

    setSubmitKind(paymentSettled ? 'paid' : 'unpaid');
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const trimmedName = customerName.trim().replace(/\s+/g, ' ');
      if (trimmedName) {
        const saved = await savePosWalkInCustomer(businessId, trimmedName);
        if (saved.ok) lastSavedCustomerKey.current = customerNameKey(trimmedName);
      }
      const cashValue = Number.isFinite(cashNum) ? cashNum : null;
      const changeDue =
        paymentSettled && cashValue != null ? Math.max(0, cashValue - cartTotal) : null;

      const settledAt = paymentSettled ? new Date().toISOString() : null;
      const { data: saleRow, error: saleErr } = await supabase
        .from('pos_sales')
        .insert({
          seller_id: businessId,
          customer_name: trimmedName || null,
          payment_method: paymentMethod,
          payment_settled: paymentSettled,
          payment_settled_at: settledAt,
          cash_received: cashValue,
          change_due: changeDue,
        })
        .select('id')
        .single();
      if (saleErr) throw saleErr;
      const saleId = saleRow.id as string;
      const rows = cart.map((l) => ({
        pos_sale_id: saleId,
        product_id: l.productId,
        product_name: l.name,
        unit_price: l.unitPrice,
        quantity: l.quantity,
      }));
      const { error: itemsErr } = await supabase.from('pos_sale_items').insert(rows);
      if (itemsErr) {
        await supabase.from('pos_sales').delete().eq('id', saleId);
        throw itemsErr;
      }
      for (const line of cart) {
        const p = products.find((x) => x.id === line.productId);
        if (p && tracksStock(p.category) && p.stock_quantity != null) {
          const { error: stockErr } = await supabase.rpc('decrement_product_stock', {
            p_product_id: line.productId,
            p_quantity: line.quantity,
          });
          if (stockErr) throw stockErr;
        }
      }

      let loyaltyNote = '';
      if (addLoyalty && trimmedName) {
        const profileUserId = resolveProfileUserIdForPosName(trimmedName, customerNameOptions);
        const awarded = await awardPosSaleLoyalty(saleId, profileUserId);
        if (!awarded.ok) {
          loyaltyNote = ` Sale saved, but points were not added. ${awarded.message}`;
        } else if (awarded.points > 0) {
          loyaltyNote = awarded.linkedApp
            ? ` ${awarded.points} loyalty point${awarded.points === 1 ? '' : 's'} added to their app account (${awarded.balance} total).`
            : ` ${awarded.points} loyalty point${awarded.points === 1 ? '' : 's'} saved on the Loyalty page (${awarded.balance} total). No app account.`;
        } else {
          loyaltyNote = ' No points added. Mark the product to earn points in Inventory.';
        }
      }

      await loadProducts();
      await loadCustomerNames();
      clearCart();
      const who = trimmedName ? `${trimmedName} · ` : '';
      const payLabel = paymentMethod === 'gcash' ? 'GCash' : 'Cash';
      setSuccess(
        paymentSettled
          ? `${who}Paid ${payLabel} sale recorded.${changeDue != null && changeDue > 0 ? ` Change: ${money(changeDue)}.` : ''}${loyaltyNote}`
          : `${who}Unpaid ${payLabel} sale recorded.${trimmedName ? ' Customer added to list.' : ''}${loyaltyNote}`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save sale');
    } finally {
      setSubmitting(false);
      setSubmitKind(null);
    }
  }

  return (
    <div className="pos-layout">
      <div className="pos-grid">
        <section className="pos-main card card-flat">
          <h2 className="pos-board-title">WRS Point of Sale</h2>
          <div className="pos-toolbar">
            <div className="pos-search">
              <SearchIcon />
              <input
                type="search"
                placeholder="Search products…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search products"
              />
              <span className="pos-search-scan" title="Barcode scan (coming soon)" aria-hidden>
                <ScanIcon />
              </span>
            </div>
            <div className="pos-category-tabs pos-category-tabs--sale" role="tablist" aria-label="Product category">
              {POS_CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="tab"
                  aria-selected={category === c.id}
                  className={`pos-category-tab${category === c.id ? ' active' : ''}`}
                  onClick={() => setCategory(c.id)}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {loading ? <p className="muted-block pos-loading">Loading products…</p> : null}
          {!loading && filteredProducts.length === 0 ? (
            <p className="muted-block pos-loading">No products match your search.</p>
          ) : null}
          <div className="pos-product-grid">
            {filteredProducts.map((p) => {
              const img = publicWrsAssetUrl(supabase, p.image_url);
              const inOrder = cart.find((line) => line.productId === p.id)?.quantity ?? 0;
              const justAdded = addedFlashId === p.id;
              return (
                <article
                  key={p.id}
                  className={`pos-product-card${justAdded ? ' pos-product-card--added' : ''}`}
                  role="button"
                  tabIndex={0}
                  aria-label={`Add ${p.name} to the order`}
                  onClick={() => addProduct(p)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      addProduct(p);
                    }
                  }}
                >
                  <div className="pos-product-media">
                    {img ? (
                      <img src={img} alt="" />
                    ) : (
                      <span className={`pos-product-placeholder pos-product-glyph--${p.category}`} aria-hidden>
                        {p.category === 'ice' ? <IceIcon /> : p.category === 'other' ? <BoxIcon /> : <DropIcon />}
                      </span>
                    )}
                  </div>
                  <div className="pos-product-top">
                    <span className={`pos-product-glyph pos-product-glyph--${p.category}`} aria-hidden>
                      {p.category === 'ice' ? <IceIcon /> : p.category === 'other' ? <BoxIcon /> : <DropIcon />}
                    </span>
                    <span className={`pos-product-badge pos-product-badge--${p.category}`}>{categoryLabel(p.category)}</span>
                  </div>
                  <h3>{p.name}</h3>
                  <p className="pos-product-price">{money(Number(p.price))}</p>
                  <p className={`pos-stock${isLowStock(p.stock_quantity) ? ' pos-stock--low' : ''}`}>
                    {tracksStock(p.category) && p.stock_quantity != null ? stockLabel(p.stock_quantity) : 'In stock'}
                  </p>
                  <span className="pos-add-btn">{inOrder > 0 ? `Added · ${inOrder}` : 'Add to cart'}</span>
                </article>
              );
            })}
          </div>
          <button
            type="button"
            className="pos-view-order"
            onClick={() => cartRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          >
            View order
            <span>
              {cartCount} {cartCount === 1 ? 'item' : 'items'} · {money(cartTotal)}
            </span>
          </button>
        </section>

        <aside id="pos-cart" ref={cartRef} className="pos-cart card card-flat">
          <div className="pos-cart-head">
            <h2>
              <CartIcon /> Cart ({cartCount} {cartCount === 1 ? 'item' : 'items'})
            </h2>
            <button type="button" className="pos-link-danger" disabled={cart.length === 0} onClick={clearCart}>
              Clear Cart
            </button>
          </div>

          <div
            className={[
              'pos-cart-lines-scroll',
              cart.length > 3 ? 'pos-cart-lines-scroll--overflow' : '',
              cart.length > 0 && cart.length <= 3 ? `pos-cart-lines-scroll--items-${cart.length}` : '',
            ]
              .filter(Boolean)
              .join(' ')}
            aria-label="Cart items"
          >
            <div className="pos-cart-lines">
              {cart.length === 0 ? (
                <p className="muted-block">Tap a product card to add it here.</p>
              ) : (
                cart.map((l) => {
                  const img = publicWrsAssetUrl(supabase, l.image_url);
                  return (
                    <div key={l.productId} className="pos-cart-line">
                      <div className="pos-cart-line-thumb">{img ? <img src={img} alt="" /> : null}</div>
                      <div className="pos-cart-line-body">
                        <div className="pos-cart-line-title">{l.name}</div>
                        <div className="pos-cart-line-unit">{money(l.unitPrice)} / pc</div>
                        <div className="pos-cart-line-foot">
                          <div className="qty-stepper">
                            <button
                              type="button"
                              aria-label="Decrease quantity"
                              onClick={() => setLineQty(l.productId, l.quantity - 1)}
                            >
                              −
                            </button>
                            <span>{l.quantity}</span>
                            <button
                              type="button"
                              aria-label="Increase quantity"
                              onClick={() => setLineQty(l.productId, l.quantity + 1)}
                            >
                              +
                            </button>
                          </div>
                          <span className="pos-cart-line-total">{money(l.unitPrice * l.quantity)}</span>
                          <button
                            type="button"
                            className="pos-icon-btn danger"
                            aria-label="Remove"
                            onClick={() => removeLine(l.productId)}
                          >
                            <TrashIcon />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
          {cart.length > 3 ? (
            <p className="field-hint pos-cart-scroll-hint">Scroll to see all {cart.length} items</p>
          ) : null}

          <div className="pos-cart-lower">
            <CustomerNameAutocomplete
              value={customerName}
              onChange={setCustomerName}
              onCommit={(name) => void rememberCustomerName(name)}
              options={customerNameOptions}
              hint={
                <p className="field-hint pos-customer-hint">
                  Tap a suggestion to use that customer. If you do not tap one, the name you typed is a new customer. The same exact name is not added twice.
                </p>
              }
            />

            <div className="pos-borrow-block">
              <label className="pos-borrow-toggle">
                <input
                  type="checkbox"
                  checked={addLoyalty}
                  onChange={(e) => setAddLoyalty(e.target.checked)}
                />
                <span>Add loyalty points to this order</span>
              </label>
              {addLoyalty ? (
                <p className="field-hint pos-customer-hint">
                  {customerName.trim()
                    ? loyaltyPoints > 0
                      ? `Adds ${loyaltyPoints} point${loyaltyPoints === 1 ? '' : 's'} for ${customerName.trim()}. App customers see it on their account. Walk-in customers are saved on the Loyalty page.`
                      : 'None of these products earn points yet. Mark them in Inventory.'
                    : 'Enter the customer name first so the points can be recorded.'}
                </p>
              ) : null}
            </div>

            <div className="pos-borrow-block">
              {borrowOpen ? (
                <>
                  <div className="pos-borrow-add-row">
                    <input
                      type="text"
                      placeholder="Container code or description"
                      value={borrowCode}
                      disabled={borrowSaving}
                      onChange={(e) => setBorrowCode(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          void addBorrowedContainer();
                        }
                      }}
                      aria-label="Container code or description"
                    />
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={borrowSaving}
                      onClick={() => void addBorrowedContainer()}
                    >
                      {borrowSaving ? 'Adding…' : 'Add'}
                    </button>
                  </div>
                  <p className="field-hint pos-customer-hint">
                    Customer name is required. Add records it right away. The field stays open so you can add more.
                  </p>
                  {borrowedAdded.length > 0 ? (
                    <ul className="pos-borrow-added">
                      {borrowedAdded.map((code, index) => (
                        <li key={`${code}-${index}`}>{code} recorded</li>
                      ))}
                    </ul>
                  ) : null}
                </>
              ) : (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setBorrowOpen(true)}>
                  Add borrowed container
                </button>
              )}
            </div>

          <div className="pos-checkout-section">
            <h3 className="pos-checkout-heading">Product summary</h3>
            <div className="pos-totals">
              <div className="pos-total-row">
                <span>Subtotal</span>
                <span>{money(cartTotal)}</span>
              </div>
              <div className="pos-total-row pos-total-row--grand">
                <span>Total</span>
                <span>{money(cartTotal)}</span>
              </div>
            </div>

            <div className="pos-payment-block">
              <span className="pos-cash-label">Payment method</span>
              <div className="pos-payment-tabs" role="tablist">
                {POS_PAYMENT_METHODS.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    role="tab"
                    aria-selected={paymentMethod === m.id}
                    className={`pos-category-tab${paymentMethod === m.id ? ' active' : ''}`}
                    onClick={() => setPaymentMethod(m.id)}
                  >
                    {m.icon === 'cash' ? <CashIcon /> : <GcashIcon />}
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            <label className="field pos-cash-field">
              <span className="pos-cash-label">
                <CashIcon /> Cash received
              </span>
              <input
                type="number"
                min={0}
                step="0.01"
                placeholder="0.00"
                value={cashReceived}
                onChange={(e) => setCashReceived(e.target.value)}
              />
            </label>
            <div className="pos-change-box">
              <span>Change</span>
              <strong>{money(change)}</strong>
            </div>
            {paymentMethod === 'gcash' ? (
              <p className="muted-block pos-gcash-hint">GCash payment — enter the cash received, then mark paid when the reference is confirmed.</p>
            ) : null}
          </div>
          </div>

          <div className="pos-cart-actions">
            {error || success || addedNote || submitting ? (
              <p
                className={`pos-sale-note${error ? ' pos-sale-note--error' : ''}${submitting ? ' pos-sale-note--loading' : ''}`}
                role="status"
              >
                {submitting ? <span className="pos-btn-spinner" aria-hidden /> : null}
                {submitting
                  ? 'Completing sale…'
                  : error ?? success ?? addedNote}
              </p>
            ) : null}
            <button
              type="button"
              className={`btn btn-primary btn-block pos-complete-btn${submitting && submitKind === 'paid' ? ' is-loading' : ''}`}
              disabled={cart.length === 0 || submitting}
              aria-busy={submitting && submitKind === 'paid'}
              onClick={() => void submitSale(true)}
            >
              {submitting && submitKind === 'paid' ? <span className="pos-btn-spinner" aria-hidden /> : <CheckIcon />}
              {submitting && submitKind === 'paid' ? 'Completing sale…' : 'Complete paid order'}
            </button>
            <button
              type="button"
              className={`btn btn-block pos-unpaid-btn${submitting && submitKind === 'unpaid' ? ' is-loading' : ''}`}
              disabled={cart.length === 0 || submitting}
              aria-busy={submitting && submitKind === 'unpaid'}
              onClick={() => void submitSale(false)}
            >
              {submitting && submitKind === 'unpaid' ? <span className="pos-btn-spinner" aria-hidden /> : null}
              {submitting && submitKind === 'unpaid' ? 'Completing sale…' : 'Complete as unpaid order'}
            </button>
            <button type="button" className="btn btn-ghost btn-block" disabled={cart.length === 0} onClick={clearCart}>
              <TrashIcon /> Clear Cart
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}

function SearchIcon() {
  return (
    <svg className="pos-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
      <path d="M20 20l-3-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function ScanIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 7V5a1 1 0 011-1h2M20 7V5a1 1 0 00-1-1h-2M4 17v2a1 1 0 001 1h2M20 17v2a1 1 0 01-1 1h-2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M7 12h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M5 12l4 4L19 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CartIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6 6h15l-1.5 9H8L6 6zM6 6L5 3H2M9 20a1 1 0 100-2 1 1 0 000 2zm8 0a1 1 0 100-2 1 1 0 000 2z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 7h16M9 7V5h6v2M10 11v6M14 11v6M6 7l1 14h10l1-14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function CashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="6" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function GcashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="5" y="2" width="14" height="20" rx="3" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="18" r="1.2" fill="currentColor" />
      <path d="M9 7h6M9 10h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
