function AnyaForgerPointer() {
    const base64Cursor = 'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAB7FBMVEVHcEwhCBg+His7GCcGAQYcCxYEAAEWBREVAw8oGCE7Fyc/KDRNTk1APj5LS0wzHilAHismEh89JjI1FSW6V25APT1QUVFPIzNQLDM+ICzOvrowJCrBZHU1NTZ5N0oxMDIfHyA7GihXLzu8cn4jDRs5FidUKzhRUlFUV1Y6MjVKRUhBPz+3X3E8ODggCBdQIjO6ub4jCxo+HivSboAiCBj/////w839peX/pKX9n6L/pab97uXf3uT1mZ35mZ786uHkjZMuLjDlkpT7nqHQaX3qlZg2NjZLRkpSLjrZ2ODVhopFQUTrfo+dm6r/o6TQg4flc4noeIzJboDKYHhSUlL15t3AwMLNvbr+rZ7AYXS5uL3Hxsv4m5/Ndof5z8buzctkQUz1w7tdWlza2to+Oj717uK+aXr/pqbebIQ7JzLl7OXm1tDo2NFLKDZoaGh2d3dDMjthW06ysbfReYdnXGT52dLJa3/wj5j2vLbmpaTO0czXkpWkTmSjWGtjVFy548OXoJ1AfFZwuZVBLjmEenjPpqDkuLHX1tfsyoVhVUTStnV2c17Zun3Pm2nTom36oJv7pZ2MipgfHyBeKTuNi5neoaHiyMby8ezN2dV1WmS4YnTG6cxbSFPH6MuhVmq8XXG8t7cDAAYAAidHcEwCPGFAAAAApHRSTlMANOPKAR0CHhkx4csbHc40yuHlzf7j5OTn/v0E/co14uHnzv3k/uPGBOHhxuXhxs7+UbLlTwLG//////////////////////////////////////////////////////////////////////////////7/////////////////////////////////////////////////////////////////AHlbedkAAAJZSURBVDjLfZPnW9pQFIeFkKVBqKA466zdux8yGhITMBQoCAJKG7ZSJ+Lee3bvPeyf2huRktDxe/LhPue896zcU/Gmp6A2uOLv6nl9X9G7VvQfQG/knqKZFqxoQTAUQ1TAw7tAN6rxos2Am/VmE6IFHlTjhqIB73ALnbcwDVDyI5gO8gv++pswogIK/gsEYYR1ULvLnXQ16CFdsY7emdP7xPm6S3pbM+8UBUHgm+stJoJoAva21pZCfGOt5IryIk2TNNCrJ9N1dZcJYIeLPRkvutwUTZ5q8OhpyFNrVA8ErYyW/CQ9+Gx6SAvANh74qZPvJMaLx1fVAHL2CgucXory2kmf7KN8g8/rdaqJYmYeXGO9rNjntcsO1kuRL48hTFWCXnjk47Ors/zCctb9ZTEg0pSjEtUA5OrG0Nz7WHB5w/Mt65AVANYAzs9b2yvxpaX4yvaWlHQCwKYqAu4W2M7MzhjDcczYzqe5dZYW+6wQWmritijHwpvfhxlm+Ovmxw9BBegvFQGaoNlgKh5mOECE51NBlrSrAaUJOZjgGC4OCIZLxGSqz1EGiCOxxPx4mOPCE4lZ1md3vF2DVCn8JBUYWVhP7qdS+8kfUdke6D9n+f0QKxC8w++0B6yT6b2Dgz1pcm0xMGK16AylOYC32u32u9KZzM+xTE6aPO63XscN6r+JwHfaG6TcYWQqcpiWPA0gvsYPklSNjkqhKQDk8rv5oS5d2QZhVQMTA7ueUDoUyoPTaBf8JzDeWHNGUU0jOF3DygCQoqbKBKMoCpuUE9ZUvqWlnSzbzv/rF2DTlwUu0/0oAAAAAElFTkSuQmCC';
    const style = document.createElement('style');
    style.type = 'text/css';
    style.innerHTML = `
        * {
            cursor: url('data:image/gif;base64,${base64Cursor}'), auto !important;
        }
    `;
    document.head.appendChild(style);
}

window.AnyaForgerPointer = AnyaForgerPointer;